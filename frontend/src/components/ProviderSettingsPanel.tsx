'use client';

import { useState, type ReactNode } from 'react';
import { Eye, EyeOff, HelpCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { BUILTIN_IMAGE_PRESETS, BUILTIN_IMAGE_PRESET_OPTIONS, resolveDerivedImagePreset, resolveDerivedImageProtocol, type ProviderProtocol } from '@/lib/nova-models';
import { TWINKLE_MODEL_PROVIDER_ID } from '@/lib/twinkle-model';
import { fetchUpstreamModels } from '@/lib/provider-models-client';
import {
  PROVIDER_KIND_OPTIONS,
  TEXT_PROTOCOL_OPTIONS,
  addManualProviderModel,
  createProviderDraft,
  guessTextProtocol,
  isCompleteProvider,
  listProtocolForKind,
  mergeFetchedModels,
  providerModelRowId,
  setProviderModelUse,
  type ProviderConfig,
  type ProviderKind,
} from '@/lib/provider-registry';
import type { TextProviderProtocol } from '@/lib/nova-text-protocol';

interface ProviderSettingsPanelProps {
  providers: ProviderConfig[];
  selectedProviderId: string;
  onChange: (providers: ProviderConfig[] | ((prev: ProviderConfig[]) => ProviderConfig[])) => void;
  onSelect: (id: string) => void;
  accountPanel?: ReactNode;
}

export function ProviderSettingsPanel({
  providers,
  selectedProviderId,
  onChange,
  onSelect,
  accountPanel,
}: ProviderSettingsPanelProps) {
  const [showApiKey, setShowApiKey] = useState(false);
  const [manualModelId, setManualModelId] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modelList, setModelList] = useState<{ connectionKey: string; models: string[] } | null>(null);
  const [selectedFetchedIds, setSelectedFetchedIds] = useState<string[]>([]);
  const [modelSearch, setModelSearch] = useState('');
  const [fetchSuccess, setFetchSuccess] = useState<string | null>(null);
  const [providerToDelete, setProviderToDelete] = useState<ProviderConfig | null>(null);
  const selected = providers.find((provider) => provider.id === selectedProviderId) || null;
  const connectionKey = JSON.stringify([selected?.id, selected?.baseUrl, selected?.apiKey, selected?.kind]);
  const fetchedModels = modelList?.connectionKey === connectionKey ? modelList.models : null;
  const configuredModelIds = new Set(selected?.models.map(model => model.modelId) || []);
  const filteredModels = fetchedModels?.filter(modelId => modelId.toLowerCase().includes(modelSearch.trim().toLowerCase())) || [];
  const selectedModelsToAdd = selectedFetchedIds.filter(modelId => fetchedModels?.includes(modelId) && !configuredModelIds.has(modelId));

  const updateSelected = (patch: Partial<ProviderConfig> | ((current: ProviderConfig) => ProviderConfig)) => {
    if (!selected) return;
    const id = selected.id;
    onChange((prev) => prev.map((provider) => {
      if (provider.id !== id) return provider;
      return typeof patch === 'function' ? patch(provider) : { ...provider, ...patch };
    }));
  };

  const handleAdd = () => {
    const draft = createProviderDraft();
    onChange((prev) => [...prev, draft]);
    onSelect(draft.id);
  };

  const handleDelete = (id: string) => {
    onChange((prev) => {
      const next = prev.filter((provider) => provider.id !== id);
      if (selectedProviderId === id) onSelect(next[0]?.id || '');
      return next;
    });
  };

  const handleFetch = async () => {
    if (!selected) return;
    if (!selected.apiKey.trim() || !selected.baseUrl.trim()) {
      setFetchError('请先填写 Base URL 和 API Key');
      return;
    }
    setFetching(true);
    setFetchError(null);
    setFetchSuccess(null);
    setModelList(null);
    setSelectedFetchedIds([]);
    setModelSearch('');
    try {
      const ids = await fetchUpstreamModels({
        baseUrl: selected.baseUrl,
        apiKey: selected.apiKey,
        protocol: listProtocolForKind(selected.kind),
      });
      setModelList({ connectionKey, models: ids });
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : '获取模型列表失败');
    } finally {
      setFetching(false);
    }
  };

  const handleAddFetchedModels = () => {
    if (selectedModelsToAdd.length === 0) return;
    updateSelected(current => ({
      ...current,
      models: mergeFetchedModels(current.models, selectedModelsToAdd),
    }));
    setFetchSuccess(`已加入 ${selectedModelsToAdd.length} 个待选模型，请点击「保存设置」使配置生效。`);
    setModelList(null);
    setSelectedFetchedIds([]);
  };

  const handleAddManual = () => {
    if (!selected) return;
    updateSelected((current) => addManualProviderModel(current, manualModelId));
    setManualModelId('');
  };

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">供应商</p>
          <p className="text-xs text-muted-foreground">选择供应商后管理连接和模型，无需重复填写每个模型的 API Key。</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={handleAdd}>
          <Plus className="w-4 h-4" />
          新增供应商
        </Button>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-[180px_minmax(0,1fr)]">
        <nav aria-label="供应商列表" className="space-y-2">
          {providers.map((provider) => {
            const isSelected = selectedProviderId === provider.id;
            return (
              <div
                key={provider.id}
                className={`group flex items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(provider.id)}
                  aria-pressed={isSelected}
                  className="min-w-0 flex-1 rounded text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <div className="font-medium truncate">{provider.name || '未命名供应商'}</div>
                  <div className="text-xs text-muted-foreground">
                    {isCompleteProvider(provider) ? `${provider.models.length} 个模型` : '待补全'}
                  </div>
                </button>
                <button
                  type="button"
                  title="删除供应商"
                  aria-label="删除供应商"
                  onClick={(e) => {
                    e.stopPropagation();
                    setProviderToDelete(provider);
                  }}
                  className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </nav>

        {selected && (
          <div className="min-w-0 space-y-4">
            {selected.id === TWINKLE_MODEL_PROVIDER_ID && accountPanel}
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="provider-name" className="text-xs text-muted-foreground">供应商名称</label>
                <Input id="provider-name" value={selected.name} onChange={(event) => updateSelected({ name: event.target.value })} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-muted-foreground">供应商协议</label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        title="供应商协议说明"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3 text-xs leading-relaxed text-muted-foreground shadow-md" align="start">
                      供应商协议决定获取模型的基准协议，不参与模型调用，模型调用以下方模型协议为准
                    </PopoverContent>
                  </Popover>
                </div>
                <Select
                  ariaLabel="供应商协议"
                  value={selected.kind}
                  onValueChange={(value) => updateSelected({ kind: value as ProviderKind })}
                  options={PROVIDER_KIND_OPTIONS}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="provider-base-url" className="text-xs text-muted-foreground">Base URL</label>
                <Input
                  id="provider-base-url"
                  value={selected.baseUrl}
                  placeholder="https://api.example.com/v1"
                  onChange={(event) => updateSelected({ baseUrl: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="provider-api-key" className="text-xs text-muted-foreground">API Key</label>
                <div className="relative">
                  <Input
                    id="provider-api-key"
                    type={showApiKey ? 'text' : 'password'}
                    value={selected.apiKey}
                    onChange={(event) => updateSelected({ apiKey: event.target.value })}
                    className="pr-8"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="default" className="h-8 gap-2" onClick={handleFetch} disabled={fetching}>
                <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
                {fetching ? '获取中...' : '获取模型列表'}
              </Button>
              <Input
                className="h-8 max-w-xs"
                value={manualModelId}
                placeholder="手动添加模型 ID"
                onChange={(event) => setManualModelId(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleAddManual();
                  }
                }}
              />
              <Button variant="outline" size="default" className="h-8" onClick={handleAddManual} disabled={!manualModelId.trim()}>添加模型</Button>
            </div>

            {fetchError && (
              <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{fetchError}</div>
            )}

            {fetchSuccess && <p role="status" className="text-sm text-muted-foreground">{fetchSuccess}</p>}

            {fetchedModels && (
              <section aria-label="供应商模型列表" className="min-w-0 space-y-3 rounded-lg border bg-muted/20 p-3">
                <div className="space-y-1">
                  <h3 className="text-sm font-medium">模型列表 · {fetchedModels.length} 个</h3>
                  <p className="text-xs text-muted-foreground">新模型默认不勾选。选择后点击「加入待选模型」，不会自动加入全部模型。</p>
                </div>
                <Input aria-label="搜索模型列表" value={modelSearch} placeholder="搜索模型 ID" onChange={event => setModelSearch(event.target.value)} />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" disabled={!filteredModels.some(modelId => !configuredModelIds.has(modelId) && !selectedFetchedIds.includes(modelId))} onClick={() => setSelectedFetchedIds(previous => [...new Set([...previous, ...filteredModels.filter(modelId => !configuredModelIds.has(modelId))])])}>
                    选择当前结果
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={selectedModelsToAdd.length === 0} onClick={() => setSelectedFetchedIds([])}>
                    清空选择
                  </Button>
                  <span role="status" className="text-xs text-muted-foreground">已选择 {selectedModelsToAdd.length} 个</span>
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-md border bg-card p-2">
                  {filteredModels.length === 0 && <p className="p-3 text-center text-xs text-muted-foreground">{fetchedModels.length === 0 ? '供应商未返回可用模型。你仍可手动添加模型 ID。' : '没有匹配的模型，请调整搜索关键词。'}</p>}
                  {filteredModels.map(modelId => {
                    const alreadyAdded = configuredModelIds.has(modelId);
                    return (
                      <label key={modelId} className={`flex items-start gap-3 rounded-md p-2 text-sm ${alreadyAdded ? 'text-muted-foreground' : 'cursor-pointer hover:bg-muted/50'}`}>
                        <input
                          type="checkbox"
                          aria-label={`选择模型 ${modelId}`}
                          checked={alreadyAdded || selectedFetchedIds.includes(modelId)}
                          disabled={alreadyAdded}
                          onChange={event => setSelectedFetchedIds(previous => event.target.checked ? [...previous, modelId] : previous.filter(id => id !== modelId))}
                          className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        />
                        <span className="min-w-0 flex-1 break-all">{modelId}</span>
                        {alreadyAdded && <span className="shrink-0 text-xs">已加入</span>}
                      </label>
                    );
                  })}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => { setModelList(null); setSelectedFetchedIds([]); }}>取消</Button>
                  <Button type="button" size="sm" disabled={selectedModelsToAdd.length === 0} onClick={handleAddFetchedModels}>加入待选模型（{selectedModelsToAdd.length}）</Button>
                </div>
              </section>
            )}

            <div className="space-y-3">
              <div className="space-y-1">
                <h3 className="text-sm font-medium">待选模型 · {selected.models.length} 个</h3>
                <p className="text-xs text-muted-foreground">只保留你选择的模型；保存后可在工作区和默认模型设置中使用。</p>
              </div>
              {selected.models.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  还没有待选模型。获取模型列表后选择加入，或手动填写模型 ID。Twinkle Model 登录也可自动配置预设模型。
                </div>
              )}
              {selected.models.map((entry) => {
                const rowId = providerModelRowId(entry);
                const isImage = entry.uses.includes('image');
                const presetId = resolveDerivedImagePreset(selected.kind, entry.modelId, entry.builtinPreset);
                const preset = BUILTIN_IMAGE_PRESETS[presetId];
                const updateEntry = (patch: Partial<typeof entry>) => updateSelected((current) => ({
                  ...current,
                  models: current.models.map(item => providerModelRowId(item) === rowId ? { ...item, ...patch } : item),
                }));
                return (
                  <section key={rowId} aria-label={`模型 ${entry.modelId}`} className="min-w-0 space-y-3 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="break-all text-sm font-medium">{entry.modelId}</p>
                        <p className="text-xs text-muted-foreground">{isImage ? '图片模型' : '文本模型'} · {entry.manual ? '手动添加' : '供应商模型'}</p>
                      </div>
                      <Button type="button" variant="ghost" size="xs" aria-label={`删除模型 ${entry.modelId}`} className="shrink-0 text-muted-foreground hover:text-destructive" onClick={() => updateSelected(current => ({ ...current, models: current.models.filter(item => providerModelRowId(item) !== rowId) }))}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5 text-xs text-muted-foreground">
                        <span>显示名称</span>
                        <Input value={entry.name} placeholder={entry.modelId} onChange={event => updateEntry({ name: event.target.value })} />
                      </label>
                      <div className="space-y-1.5">
                        <p className="text-xs text-muted-foreground">模型用途</p>
                        <div className="flex h-9 items-center gap-3 rounded-md border px-3">
                          <span className={`text-xs ${!isImage ? 'font-medium' : 'text-muted-foreground'}`}>文本</span>
                          <Switch aria-label={`将 ${entry.modelId} 用作图片模型`} checked={isImage} onCheckedChange={checked => updateSelected(current => setProviderModelUse(current, rowId, checked ? 'image' : 'text'))} />
                          <span className={`text-xs ${isImage ? 'font-medium' : 'text-muted-foreground'}`}>图片</span>
                        </div>
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <p className="text-xs text-muted-foreground">{isImage ? '图片模板' : '文本请求协议'}</p>
                        <Select
                          ariaLabel={`${entry.modelId} ${isImage ? '图片模板' : '文本请求协议'}`}
                          value={isImage ? presetId : entry.textProtocol || guessTextProtocol(selected.kind, entry.modelId)}
                          onValueChange={value => {
                            if (isImage) {
                              const nextPreset = BUILTIN_IMAGE_PRESETS[value as keyof typeof BUILTIN_IMAGE_PRESETS];
                              updateEntry({ builtinPreset: nextPreset.id, imageProtocol: undefined, maxRefImages: nextPreset.maxRefImages, maxOutputSize: nextPreset.maxOutputSize, supportsAdvancedParams: nextPreset.supportsAdvancedParams });
                            } else {
                              updateEntry({ textProtocol: value as TextProviderProtocol });
                            }
                          }}
                          options={isImage ? BUILTIN_IMAGE_PRESET_OPTIONS : TEXT_PROTOCOL_OPTIONS}
                        />
                      </div>
                    </div>
                    {isImage && (
                      <details className="rounded-md bg-muted/30 p-2.5">
                        <summary className="cursor-pointer text-xs text-muted-foreground focus-visible:outline-2 focus-visible:outline-primary">图片高级设置</summary>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5 sm:col-span-2">
                            <p className="text-xs text-muted-foreground">图片请求协议</p>
                            <Select ariaLabel={`${entry.modelId} 图片请求协议`} value={entry.imageProtocol || resolveDerivedImageProtocol(selected.kind, entry.modelId, presetId)} onValueChange={value => updateEntry({ imageProtocol: value as ProviderProtocol })} options={[
                              { value: 'openai', label: 'OpenAI 兼容' },
                              { value: 'google', label: 'Google Gemini' },
                              { value: 'grok', label: 'Grok / xAI' },
                              { value: 'doubao', label: '豆包 Seedream' },
                              { value: 'alibaba-dashscope', label: '阿里百炼' },
                            ]} />
                          </div>
                          <label className="space-y-1.5 text-xs text-muted-foreground">
                            <span>参考图上限</span>
                            <Input type="number" min={0} max={32} value={entry.maxRefImages ?? preset.maxRefImages} onChange={event => updateEntry({ maxRefImages: Math.min(32, Math.max(0, Math.floor(Number(event.target.value) || 0))) })} />
                          </label>
                          <div className="space-y-1.5">
                            <p className="text-xs text-muted-foreground">最高输出尺寸</p>
                            <Select ariaLabel={`${entry.modelId} 最高输出尺寸`} value={entry.maxOutputSize || preset.maxOutputSize} onValueChange={value => updateEntry({ maxOutputSize: value as typeof entry.maxOutputSize })} options={['512', '1K', '2K', '4K'].map(size => ({ value: size, label: size === '512' ? '0.5K' : size }))} />
                          </div>
                          <label className="flex items-center justify-between gap-2 text-xs text-muted-foreground sm:col-span-2">
                            <span>启用图片高级参数</span>
                            <Switch checked={entry.supportsAdvancedParams ?? preset.supportsAdvancedParams} onCheckedChange={checked => updateEntry({ supportsAdvancedParams: checked })} />
                          </label>
                        </div>
                      </details>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <Dialog open={Boolean(providerToDelete)} onOpenChange={(open) => { if (!open) setProviderToDelete(null); }}>
        <DialogContent className="sm:max-w-md z-[60]" overlayClassName="bg-black/30">
          <DialogHeader>
            <DialogTitle>删除供应商</DialogTitle>
            <DialogDescription>
              确定要删除供应商「{providerToDelete?.name || '未命名供应商'}」吗？删除后该供应商及其下的 {providerToDelete?.models.length || 0} 个模型配置都将被移除。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end gap-2 mt-4">
            <Button variant="outline" size="default" onClick={() => setProviderToDelete(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              size="default"
              onClick={() => {
                if (providerToDelete) {
                  handleDelete(providerToDelete.id);
                  setProviderToDelete(null);
                }
              }}
            >
              确定删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
