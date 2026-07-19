import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNovaTask, type CreateNovaTaskInput } from '@/lib/ccode-task-client';

const taskInput: CreateNovaTaskInput = {
  apiKey: 'key',
  baseUrl: 'https://example.com',
  protocol: 'openai',
  mode: 'text-to-image',
  prompt: 'test',
  outputSize: '1K',
  aspectRatio: '1:1',
  temperature: 1,
  model: 'image-model',
  parallelCount: 1,
  images: [],
};

function getSubmittedBody(): Record<string, unknown> {
  const init = vi.mocked(fetch).mock.calls[0]?.[1];
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    JSON.stringify({ taskId: 'task-1' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )));
});

describe('image generation retry setting', () => {
  it('submits the default of three retries for existing users', async () => {
    await createNovaTask(taskInput);
    expect(getSubmittedBody().maxRetries).toBe(3);
  });

  it('submits the configured retry limit for every image task', async () => {
    localStorage.setItem('nova-model-registry', JSON.stringify({
      imageModels: [],
      textModels: [],
      defaults: {},
      generationSettings: { maxRetries: 7 },
    }));

    await createNovaTask({ ...taskInput, parallelCount: 4 });
    expect(getSubmittedBody()).toEqual(expect.objectContaining({
      maxRetries: 7,
      parallelCount: 4,
    }));
  });
});
