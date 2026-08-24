import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GifGenerationWorkspace } from '../GifGenerationWorkspace';
import { syncDynamicModelExports } from '@/lib/gemini-config';
import { saveRegistry } from '@/lib/nova-models';

describe('GifGenerationWorkspace', () => {
  beforeEach(() => {
    localStorage.clear();
    saveRegistry({
      imageModels: [{
        id: 'gpt-image-2',
        protocol: 'openai',
        name: 'GPT Image 2',
        modelId: 'gpt-image-2',
        apiKey: 'test-key',
        baseUrl: 'https://api.openai.com',
        builtinPreset: 'gpt-image-2',
        maxRefImages: 16,
        maxOutputSize: '4K',
        supportsAdvancedParams: true,
      }],
      textModels: [],
      defaults: {
        textToImage: 'gpt-image-2',
        imageToImage: 'gpt-image-2',
        reversePrompt: '',
        agent: '',
        promptOptimize: '',
        imageDescribe: '',
        sliceDecomposition: '',
        sliceReconstruct: '',
        sliceImageEdit: 'gpt-image-2',
      },
      generationSettings: { maxRetries: 3 },
    });
    syncDynamicModelExports();
  });

  it('initializes once when a configured GPT model is available', async () => {
    render(
      <GifGenerationWorkspace
        hasApiKey
        onConfigureApiKey={() => undefined}
        onError={() => undefined}
      />,
    );

    await act(async () => {});

    expect(screen.getByPlaceholderText('描述动画主题 / 动作，例如：一只虎斑猫缓慢眨眼')).toBeInTheDocument();
    expect(screen.getByTitle('模型')).toHaveTextContent('GPT Image 2');
  });
});
