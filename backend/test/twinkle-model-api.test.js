const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TWINKLE_MODEL_KEY_NAME,
  listAllTwinkleApiKeys,
  selectTwinkleDefaultApiKeys,
} = require('../twinkle-model-api');

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

test('selectTwinkleDefaultApiKeys selects the active system default key', () => {
  const result = selectTwinkleDefaultApiKeys([
    { name: TWINKLE_MODEL_KEY_NAME, key: 'inactive-key', status: 'inactive' },
    { name: TWINKLE_MODEL_KEY_NAME, key: 'system-key', status: 'active' },
  ]);

  assert.deepEqual(result, {
    key: 'system-key',
    missingName: undefined,
  });
});

test('selectTwinkleDefaultApiKeys reports the missing system default name', () => {
  const result = selectTwinkleDefaultApiKeys([
    { name: '旧密钥名称', key: 'old-key', status: 'active' },
  ]);

  assert.equal(result.key, undefined);
  assert.equal(result.missingName, TWINKLE_MODEL_KEY_NAME);
});

test('listAllTwinkleApiKeys follows paginated API key responses', async () => {
  const requestedUrls = [];
  const fetchImpl = async (url, options) => {
    requestedUrls.push({ url, options });
    const page = new URL(url).searchParams.get('page');
    return jsonResponse({
      code: 0,
      data: page === '1'
        ? { items: [{ id: 1 }], pages: 2 }
        : { items: [{ id: 2 }], pages: 2 },
    });
  };

  const result = await listAllTwinkleApiKeys('access-token', fetchImpl);

  assert.deepEqual(result, [{ id: 1 }, { id: 2 }]);
  assert.equal(requestedUrls.length, 2);
  assert.equal(requestedUrls[0].options.headers.Authorization, 'Bearer access-token');
});

test('requestTwinkleModel aborts a stalled upstream request', async () => {
  const { requestTwinkleModel } = require('../twinkle-model-api');
  const error = new Error('aborted');
  error.name = 'AbortError';

  await assert.rejects(
    requestTwinkleModel('/keys', {}, async () => { throw error; }),
    result => result.code === 'TWINKLE_MODEL_TIMEOUT' && result.statusCode === 504,
  );
});
