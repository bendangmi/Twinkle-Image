import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderSettingsPanel } from '../ProviderSettingsPanel';
import { fetchUpstreamModels } from '@/lib/provider-models-client';
import type { ProviderConfig } from '@/lib/provider-registry';

vi.mock('@/lib/provider-models-client', () => ({ fetchUpstreamModels: vi.fn() }));

const provider: ProviderConfig = {
  id: 'custom-provider', name: 'Custom', kind: 'openai-compatible',
  apiKey: 'test-key', baseUrl: 'https://example.test',
  models: [{ id: 'existing', modelId: 'existing-model', name: 'Existing alias', uses: ['text'], textProtocol: 'openai-responses' }],
};

function renderPanel() {
  const onChange = vi.fn();
  function PanelHarness() {
    const [providers, setProviders] = useState([provider]);
    return <ProviderSettingsPanel providers={providers} selectedProviderId={provider.id} onSelect={() => undefined} onChange={next => { onChange(next); setProviders(next); }} />;
  }
  render(<PanelHarness />);
  return { onChange };
}

async function fetchList() {
  fireEvent.click(screen.getByRole('button', { name: '获取模型列表' }));
  return screen.findByRole('region', { name: '供应商模型列表' });
}

describe('ProviderSettingsPanel model selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchUpstreamModels).mockResolvedValue(['existing-model', 'gpt-image-2', 'gpt-5.6-sol', 'claude-sonnet']);
  });

  it('fetches a preview without adding or selecting new models', async () => {
    const { onChange } = renderPanel();
    await fetchList();
    expect(fetchUpstreamModels).toHaveBeenCalledWith({ baseUrl: 'https://example.test', apiKey: 'test-key', protocol: 'openai' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: '选择模型 gpt-image-2' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '选择模型 gpt-5.6-sol' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: '加入待选模型（0）' })).toBeDisabled();
    expect(screen.queryByRole('region', { name: '模型 gpt-image-2' })).not.toBeInTheDocument();
  });

  it('adds only selected models and preserves existing model settings', async () => {
    renderPanel();
    await fetchList();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择模型 gpt-image-2' }));
    fireEvent.click(screen.getByRole('button', { name: '加入待选模型（1）' }));
    expect(screen.getByRole('region', { name: '模型 gpt-image-2' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '模型 gpt-5.6-sol' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '模型 claude-sonnet' })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('Existing alias')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'existing-model 文本请求协议' })).toHaveTextContent('OpenAI Responses');
    expect(screen.queryByRole('region', { name: '供应商模型列表' })).not.toBeInTheDocument();
    expect(screen.getByText('已加入 1 个待选模型，请点击「保存设置」使配置生效。')).toBeInTheDocument();
  });

  it('marks configured models as already added and prevents duplicates on repeated fetches', async () => {
    renderPanel();
    await fetchList();
    const existing = screen.getByRole('checkbox', { name: '选择模型 existing-model' });
    expect(existing).toBeChecked();
    expect(existing).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择模型 gpt-image-2' }));
    fireEvent.click(screen.getByRole('button', { name: '加入待选模型（1）' }));
    await fetchList();
    expect(screen.getByRole('checkbox', { name: '选择模型 gpt-image-2' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: '选择模型 gpt-5.6-sol' })).not.toBeChecked();
    expect(screen.getAllByRole('region', { name: '模型 gpt-image-2' })).toHaveLength(1);
  });

  it('supports search and selecting only the current results', async () => {
    renderPanel();
    await fetchList();
    fireEvent.change(screen.getByRole('textbox', { name: '搜索模型列表' }), { target: { value: 'GPT' } });
    fireEvent.click(screen.getByRole('button', { name: '选择当前结果' }));
    expect(screen.getByRole('button', { name: '加入待选模型（2）' })).toBeEnabled();
    fireEvent.change(screen.getByRole('textbox', { name: '搜索模型列表' }), { target: { value: 'claude' } });
    expect(screen.getByRole('checkbox', { name: '选择模型 claude-sonnet' })).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '加入待选模型（2）' }));
    expect(screen.getByRole('region', { name: '模型 gpt-image-2' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '模型 gpt-5.6-sol' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '模型 claude-sonnet' })).not.toBeInTheDocument();
  });

  it('cancels selection without changing configured models', async () => {
    const { onChange } = renderPanel();
    await fetchList();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择模型 gpt-image-2' }));
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: '供应商模型列表' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '模型 gpt-image-2' })).not.toBeInTheDocument();
  });

  it('shows empty and failed responses without modifying models', async () => {
    vi.mocked(fetchUpstreamModels).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('获取失败'));
    const { onChange } = renderPanel();
    await fetchList();
    expect(screen.getByText('供应商未返回可用模型。你仍可手动添加模型 ID。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '获取模型列表' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('获取失败'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: '供应商模型列表' })).not.toBeInTheDocument();
  });

  it('hides a fetched list when provider credentials change', async () => {
    renderPanel();
    await fetchList();
    fireEvent.click(screen.getByRole('checkbox', { name: '选择模型 gpt-image-2' }));
    fireEvent.change(screen.getByLabelText('API Key'), { target: { value: 'changed-key' } });
    expect(screen.queryByRole('region', { name: '供应商模型列表' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: '模型 gpt-image-2' })).not.toBeInTheDocument();
    await fetchList();
    expect(screen.getByRole('checkbox', { name: '选择模型 gpt-image-2' })).not.toBeChecked();
  });
});
