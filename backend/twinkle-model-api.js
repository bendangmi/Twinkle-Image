const TWINKLE_MODEL_API_BASE_URL = 'https://big-model.smart-agi.com/api/v1';
const TWINKLE_MODEL_KEY_NAMES = Object.freeze({
  text: '【文本】GPT Pro20 默认分组',
  gptImage2: '【图片】GPT Image2 默认分组',
  bananaPro: '【图片】Gemini Banana 默认分组',
});

function createTwinkleApiError(statusCode, message, code = 'TWINKLE_MODEL_REQUEST_FAILED') {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function getUpstreamErrorMessage(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;
  return String(payload.message || payload.error || payload.detail || fallback);
}

async function requestTwinkleModel(pathname, options = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`${TWINKLE_MODEL_API_BASE_URL}${pathname}`, {
    method: options.method || 'GET',
    headers: {
      'Accept': 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    // The caller still receives a useful status-specific error below.
  }

  if (!response.ok) {
    const status = response.status || 502;
    throw createTwinkleApiError(
      status,
      getUpstreamErrorMessage(payload, `Twinkle Model 请求失败 (${status})`),
      status === 401 ? 'TWINKLE_MODEL_UNAUTHORIZED' : 'TWINKLE_MODEL_REQUEST_FAILED',
    );
  }

  if (payload && typeof payload === 'object' && 'code' in payload) {
    if (payload.code !== 0) {
      throw createTwinkleApiError(
        400,
        getUpstreamErrorMessage(payload, 'Twinkle Model 请求失败'),
      );
    }
    return payload.data;
  }

  return payload;
}

function selectTwinkleDefaultApiKeys(apiKeys) {
  const items = Array.isArray(apiKeys) ? apiKeys : [];
  const selected = {};
  const missingNames = [];

  for (const [slot, requiredName] of Object.entries(TWINKLE_MODEL_KEY_NAMES)) {
    const matches = items.filter(item => item && item.name === requiredName && typeof item.key === 'string' && item.key.trim());
    const match = matches.find(item => item.status === 'active') || matches[0];
    if (match) {
      selected[slot] = match.key.trim();
    } else {
      missingNames.push(requiredName);
    }
  }

  return { keys: selected, missingNames };
}

async function listAllTwinkleApiKeys(accessToken, fetchImpl = fetch) {
  const items = [];
  let page = 1;
  let pages = 1;

  while (page <= pages) {
    const query = new URLSearchParams({
      page: String(page),
      page_size: '100',
      sort_by: 'sort_order',
      sort_order: 'asc',
    });
    const result = await requestTwinkleModel(`/keys?${query}`, { accessToken }, fetchImpl);
    if (Array.isArray(result?.items)) items.push(...result.items);
    pages = Math.min(10, Math.max(1, Number(result?.pages) || 1));
    page += 1;
  }

  return items;
}

async function loginToTwinkleModel(email, password, fetchImpl = fetch) {
  return requestTwinkleModel('/auth/login', {
    method: 'POST',
    body: { email, password },
  }, fetchImpl);
}

async function completeTwinkleModel2FA(tempToken, totpCode, fetchImpl = fetch) {
  return requestTwinkleModel('/auth/login/2fa', {
    method: 'POST',
    body: { temp_token: tempToken, totp_code: totpCode },
  }, fetchImpl);
}

async function refreshTwinkleModelSession(refreshToken, fetchImpl = fetch) {
  return requestTwinkleModel('/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  }, fetchImpl);
}

async function logoutTwinkleModelSession(refreshToken, fetchImpl = fetch) {
  return requestTwinkleModel('/auth/logout', {
    method: 'POST',
    body: { refresh_token: refreshToken },
  }, fetchImpl);
}

module.exports = {
  TWINKLE_MODEL_API_BASE_URL,
  TWINKLE_MODEL_KEY_NAMES,
  completeTwinkleModel2FA,
  listAllTwinkleApiKeys,
  loginToTwinkleModel,
  logoutTwinkleModelSession,
  refreshTwinkleModelSession,
  requestTwinkleModel,
  selectTwinkleDefaultApiKeys,
};
