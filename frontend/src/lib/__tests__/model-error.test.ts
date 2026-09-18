import { describe, expect, it } from 'vitest';
import { extractUpstreamErrorMessage, readModelHttpError } from '@/lib/model-error';
import { handleSimpleTextStreamEvent } from '@/lib/nova-proxy-text';

describe('model upstream errors', () => {
  it('extracts nested provider messages and diagnostic metadata', () => {
    const message = extractUpstreamErrorMessage({
      error: {
        message: 'Quota exhausted',
        code: 'billing_hard_limit',
        type: 'insufficient_quota',
      },
      request_id: 'req_123',
    });

    expect(message).toContain('Quota exhausted');
    expect(message).toContain('billing_hard_limit');
    expect(message).toContain('insufficient_quota');
    expect(message).toContain('req_123');
  });

  it('extracts validation error arrays', () => {
    expect(extractUpstreamErrorMessage({
      errors: [
        { detail: 'model is required' },
        { message: 'image is invalid' },
      ],
    })).toBe('model is required; image is invalid');
  });

  it('preserves plain-text upstream response bodies', async () => {
    const error = await readModelHttpError(new Response(
      'provider overloaded; request_id=text_req_9',
      { status: 503, statusText: 'Service Unavailable' },
    ));

    expect(error.message).toBe(
      '503 Service Unavailable: provider overloaded; request_id=text_req_9',
    );
  });

  it('throws string errors received in a model event stream', () => {
    expect(() => handleSimpleTextStreamEvent(
      'openai-responses',
      { type: 'response.error', error: 'upstream stream failed' },
      'error',
      '',
      () => undefined,
      () => undefined,
    )).toThrow('upstream stream failed');
  });
});
