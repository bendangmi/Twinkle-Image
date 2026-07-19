const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_IMAGE_MAX_RETRIES,
  getImageRetryDelayMs,
  runImageGenerationWithRetries,
} = require('../image-retry');

test('defaults to three retries and stops after the fourth failed attempt', async () => {
  let attempts = 0;
  const delays = [];

  await assert.rejects(
    runImageGenerationWithRetries(async () => {
      attempts += 1;
      throw new Error('failed');
    }, { waitFor: async (delay) => delays.push(delay) }),
    /failed/,
  );

  assert.equal(DEFAULT_IMAGE_MAX_RETRIES, 3);
  assert.equal(attempts, 4);
  assert.deepEqual(delays, [1000, 2000, 4000]);
});

test('returns as soon as a retry succeeds', async () => {
  let attempts = 0;
  const result = await runImageGenerationWithRetries(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('temporary failure');
    return 'image';
  }, { maxRetries: 5, waitFor: async () => undefined });

  assert.equal(result, 'image');
  assert.equal(attempts, 3);
});

test('supports disabling retries', async () => {
  let attempts = 0;
  await assert.rejects(
    runImageGenerationWithRetries(async () => {
      attempts += 1;
      throw new Error('failed');
    }, { maxRetries: 0, waitFor: async () => undefined }),
  );
  assert.equal(attempts, 1);
});

test('retries parallel image slots independently without repeating successful slots', async () => {
  const attempts = [0, 0, 0];
  const operations = [
    async () => {
      attempts[0] += 1;
      return 'image-0';
    },
    async () => {
      attempts[1] += 1;
      if (attempts[1] < 3) throw new Error('temporary failure');
      return 'image-1';
    },
    async () => {
      attempts[2] += 1;
      throw new Error('permanent failure');
    },
  ];

  const results = await Promise.allSettled(operations.map((operation) => (
    runImageGenerationWithRetries(operation, {
      maxRetries: 2,
      waitFor: async () => undefined,
    })
  )));

  assert.deepEqual(attempts, [1, 3, 3]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'fulfilled');
  assert.equal(results[2].status, 'rejected');
  assert.equal(results[0].value, 'image-0');
  assert.equal(results[1].value, 'image-1');
});

test('uses capped exponential retry delays', () => {
  assert.equal(getImageRetryDelayMs(1), 1000);
  assert.equal(getImageRetryDelayMs(2), 2000);
  assert.equal(getImageRetryDelayMs(3), 4000);
  assert.equal(getImageRetryDelayMs(4), 5000);
});
