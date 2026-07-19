const DEFAULT_IMAGE_MAX_RETRIES = 3;
const MAX_IMAGE_MAX_RETRIES = 10;

function isValidImageMaxRetries(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_IMAGE_MAX_RETRIES;
}

function getImageRetryDelayMs(retryNumber) {
  return Math.min(5000, 1000 * (2 ** Math.max(0, retryNumber - 1)));
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runImageGenerationWithRetries(operation, options = {}) {
  const maxRetries = isValidImageMaxRetries(options.maxRetries)
    ? options.maxRetries
    : DEFAULT_IMAGE_MAX_RETRIES;
  const waitFor = options.waitFor || wait;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation({ attempt, maxRetries });
    } catch (error) {
      if (attempt >= maxRetries) throw error;
      const retryNumber = attempt + 1;
      options.onRetry?.({ error, retryNumber, maxRetries });
      await waitFor(getImageRetryDelayMs(retryNumber));
    }
  }

  throw new Error('图片生成重试流程异常结束');
}

module.exports = {
  DEFAULT_IMAGE_MAX_RETRIES,
  MAX_IMAGE_MAX_RETRIES,
  isValidImageMaxRetries,
  getImageRetryDelayMs,
  runImageGenerationWithRetries,
};
