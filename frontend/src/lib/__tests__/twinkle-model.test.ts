import { afterEach, describe, expect, it } from 'vitest';
import { applyTwinkleModelKeys } from '@/lib/twinkle-model';
import { DEFAULT_DEFAULTS, loadRegistry, saveRegistry, type NovaModelRegistry } from '@/lib/nova-models';

const registry: NovaModelRegistry = {
  imageModels: [{
    id: 'custom-image',
    protocol: 'grok',
    name: 'Custom image',
    modelId: 'custom-image',
    apiKey: 'custom-key',
    baseUrl: 'https://example.test',
    builtinPreset: 'grok-imagine-image',
    maxRefImages: 0,
    maxOutputSize: '1K',
    supportsAdvancedParams: false,
  }],
  textModels: [{
    id: 'custom-text',
    protocol: 'openai-chat-completions',
    name: 'Custom text',
    modelId: 'custom-text',
    apiKey: 'custom-key',
    baseUrl: 'https://example.test',
  }],
  defaults: {
    ...DEFAULT_DEFAULTS,
    textToImage: 'custom-image',
    imageToImage: 'custom-image',
    reversePrompt: 'custom-text',
    agent: 'custom-text',
    promptOptimize: 'custom-text',
    imageDescribe: 'custom-text',
  },
  generationSettings: { maxRetries: 2 },
};

describe('applyTwinkleModelKeys', () => {
  afterEach(() => localStorage.clear());

  it('preserves Twinkle models and existing keys through provider-based storage', () => {
    saveRegistry(applyTwinkleModelKeys(registry, 'system-key'));
    const restored = loadRegistry();
    expect(restored.imageModels.map(model => model.id)).toContain('custom-image');
    expect(restored.imageModels.find(model => model.modelId === 'gpt-image-2.5')?.apiKey).toBe('system-key');
    expect(restored.imageModels.find(model => model.modelId === 'gemini-3-pro-image-preview')?.protocol).toBe('google');
    expect(restored.textModels.find(model => model.modelId === 'gpt-5.6-sol')?.apiKey).toBe('system-key');
  });

  it('creates the requested templates and makes them the defaults', () => {
    const configured = applyTwinkleModelKeys(registry, 'system-key');

    expect(configured.imageModels.slice(0, 3)).toMatchObject([
      {
        protocol: 'openai',
        name: 'GPT Image 2.5',
        modelId: 'gpt-image-2.5',
        apiKey: 'system-key',
        baseUrl: 'https://st.smart-agi.com',
        builtinPreset: 'gpt-image-2',
        maxRefImages: 16,
        maxOutputSize: '4K',
        supportsAdvancedParams: true,
      },
      {
        protocol: 'openai',
        name: 'GPT Image 2',
        modelId: 'gpt-image-2',
        apiKey: 'system-key',
        baseUrl: 'https://st.smart-agi.com',
        builtinPreset: 'gpt-image-2',
        maxRefImages: 16,
        maxOutputSize: '4K',
        supportsAdvancedParams: true,
      },
      {
        protocol: 'google',
        name: 'Banana Pro',
        modelId: 'gemini-3-pro-image-preview',
        apiKey: 'system-key',
        baseUrl: 'https://st.smart-agi.com',
        builtinPreset: 'gemini-3-pro-image-preview',
        maxRefImages: 14,
        maxOutputSize: '4K',
        supportsAdvancedParams: false,
      },
    ]);
    expect(configured.textModels[0]).toMatchObject({
      protocol: 'openai-responses',
      name: 'gpt-5.6-sol',
      modelId: 'gpt-5.6-sol',
      apiKey: 'system-key',
      baseUrl: 'https://st.smart-agi.com',
      note: 'OpenAI Response',
    });
    expect(configured.imageModels.at(-1)?.id).toBe('custom-image');
    expect(configured.textModels.at(-1)?.id).toBe('custom-text');
    expect(configured.defaults).toMatchObject({
      textToImage: configured.imageModels[0].id,
      imageToImage: configured.imageModels[0].id,
      reversePrompt: configured.textModels[0].id,
      agent: configured.textModels[0].id,
      promptOptimize: configured.textModels[0].id,
      imageDescribe: configured.textModels[0].id,
    });
  });
});
