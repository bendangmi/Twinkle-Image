const TWINKLE_MODEL_API_BASE_URL = 'https://big-model.smart-agi.com/api/v1';
const TWINKLE_MODEL_KEY_NAME = '系统默认密钥';
const TWINKLE_MODEL_REQUEST_TIMEOUT_MS = 15_000;

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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TWINKLE_MODEL_REQUEST_TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(`${TWINKLE_MODEL_API_BASE_URL}${pathname}`, {
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw createTwinkleApiError(504, 'Twinkle Model 请求超时，请稍后重试', 'TWINKLE_MODEL_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

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
  const matches = items.filter(item => item && item.name === TWINKLE_MODEL_KEY_NAME && typeof item.key === 'string' && item.key.trim());
  const match = matches.find(item => item.status === 'active') || matches[0];

  if (!match) {
    return { key: undefined, missingName: TWINKLE_MODEL_KEY_NAME };
  }

  return { key: match.key.trim(), missingName: undefined };
}

async function listAllTwinkleApiKeys(accessToken, fetchImpl = fetch) {
  const requestPage = async page => {
    const query = new URLSearchParams({
      page: String(page),
      page_size: '100',
      sort_by: 'sort_order',
      sort_order: 'asc',
    });
    return requestTwinkleModel(`/keys?${query}`, { accessToken }, fetchImpl);
  };

  const firstPage = await requestPage(1);
  const pages = Math.min(10, Math.max(1, Number(firstPage?.pages) || 1));
  const pageResults = await Promise.all([
    firstPage,
    ...Array.from({ length: pages - 1 }, (_, index) => requestPage(index + 2)),
  ]);

  return pageResults.flatMap(result => Array.isArray(result?.items) ? result.items : []);
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
  TWINKLE_MODEL_KEY_NAME,
  completeTwinkleModel2FA,
  listAllTwinkleApiKeys,
  loginToTwinkleModel,
  logoutTwinkleModelSession,
  refreshTwinkleModelSession,
  requestTwinkleModel,
  selectTwinkleDefaultApiKeys,
};
