const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TWINKLE_MODEL_KEY_NAMES,
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

test('selectTwinkleDefaultApiKeys selects named active default keys', () => {
  const result = selectTwinkleDefaultApiKeys([
    { name: TWINKLE_MODEL_KEY_NAMES.text, key: 'text-inactive', status: 'inactive' },
    { name: TWINKLE_MODEL_KEY_NAMES.text, key: 'text-active', status: 'active' },
    { name: TWINKLE_MODEL_KEY_NAMES.gptImage2, key: 'image-key', status: 'active' },
    { name: TWINKLE_MODEL_KEY_NAMES.bananaPro, key: 'banana-key', status: 'active' },
  ]);

  assert.deepEqual(result, {
    keys: { text: 'text-active', gptImage2: 'image-key', bananaPro: 'banana-key' },
    missingNames: [],
  });
});

test('selectTwinkleDefaultApiKeys reports the exact missing default names', () => {
  const result = selectTwinkleDefaultApiKeys([
    { name: TWINKLE_MODEL_KEY_NAMES.text, key: 'text-key', status: 'active' },
  ]);

  assert.equal(result.keys.text, 'text-key');
  assert.deepEqual(result.missingNames, [
    TWINKLE_MODEL_KEY_NAMES.gptImage2,
    TWINKLE_MODEL_KEY_NAMES.bananaPro,
  ]);
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
