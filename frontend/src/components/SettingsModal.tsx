'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  ImageIcon,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  RefreshCw,
  Save,
  Settings,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { BackupProgress } from '@/components/BackupProgress';
import { ProviderSettingsPanel } from '@/components/ProviderSettingsPanel';
import {
  DEFAULT_DEFAULTS,
  DEFAULT_GENERATION_SETTINGS,
  deriveImageAndTextModels,
  MAX_IMAGE_GENERATION_RETRIES,
  isSliceCapableImageModel,
  loadRegistry,
  saveRegistry,
  type DefaultModels,
  type GenerationSettings,
  type ImageModelConfig,
  type TextModelConfig,
} from '@/lib/nova-models';
import { type ProviderConfig } from '@/lib/provider-registry';
import { syncDynamicModelExports } from '@/lib/gemini-config';
import { exportAllData, importAllData, downloadBlob, generateBackupFilename, type BackupProgress as BackupProgressType } from '@/lib/backup-utils';
import { checkModelsAvailability, type ModelStatus } from '@/lib/ccode-task-client';
import { hasAnyApiKey } from '@/lib/settings-storage';
import { BA_RANDOM_URL, BING_WALLPAPER_URL } from '@/lib/constants';
import { PROMPT_DATA_SOURCES, getPromptSourceLabel } from '@/lib/prompt-gallery-data';
import {
  TWINKLE_MODEL_ACCOUNT_URL,
  TWINKLE_MODEL_PROVIDER_ID,
  TWINKLE_MODEL_REQUEST_BASE_URL,
  applyTwinkleModelKeys,
  clearTwinkleModelSession,
  completeTwinkleModelLogin2FA,
  fetchTwinkleModelDefaultKeys,
  isTwinkleModel2FAChallenge,
  loadTwinkleModelSession,
  loginTwinkleModel,
  logoutTwinkleModel,
  saveTwinkleModelSession,
  type TwinkleModelLogin2FAChallenge,
  type TwinkleModelSession,
} from '@/lib/twinkle-model';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApiKeyChange?: (hasKey: boolean) => void;
}


function isCompleteImageModel(model: ImageModelConfig): boolean {
  return Boolean(model.name.trim() && model.modelId.trim() && model.apiKey.trim() && model.baseUrl.trim());
}

function isCompleteTextModel(model: TextModelConfig): boolean {
  return Boolean(model.name.trim() && model.modelId.trim() && model.apiKey.trim() && model.baseUrl.trim());
}

function getImageModelLabel(models: ImageModelConfig[], id: string): string | undefined {
  return models.find((model) => model.id === id)?.name;
}

function getTextModelLabel(models: TextModelConfig[], id: string): string | undefined {
  return models.find((model) => model.id === id)?.name;
}

function normalizeDefaults(
  defaults: DefaultModels,
  imageModels: ImageModelConfig[],
  textModels: TextModelConfig[],
): DefaultModels {
  const completeImageModels = imageModels.filter(isCompleteImageModel);
  const completeTextModels = textModels.filter(isCompleteTextModel);
  const sliceCapableImageModels = completeImageModels.filter(isSliceCapableImageModel);
  const firstImageModelId = completeImageModels[0]?.id || '';
  const firstTextModelId = completeTextModels[0]?.id || '';

  return {
    textToImage: completeImageModels.some(model => model.id === defaults.textToImage) ? defaults.textToImage : firstImageModelId,
    imageToImage: completeImageModels.some(model => model.id === defaults.imageToImage) ? defaults.imageToImage : firstImageModelId,
    reversePrompt: completeTextModels.some((model) => model.id === defaults.reversePrompt) ? defaults.reversePrompt : firstTextModelId,
    agent: completeTextModels.some((model) => model.id === defaults.agent) ? defaults.agent : firstTextModelId,
    promptOptimize: completeTextModels.some((model) => model.id === defaults.promptOptimize) ? defaults.promptOptimize : firstTextModelId,
    imageDescribe: completeTextModels.some((model) => model.id === defaults.imageDescribe) ? defaults.imageDescribe : firstTextModelId,
    sliceDecomposition: completeTextModels.some((model) => model.id === defaults.sliceDecomposition) ? defaults.sliceDecomposition : firstTextModelId,
    sliceReconstruct: completeTextModels.some((model) => model.id === defaults.sliceReconstruct) ? defaults.sliceReconstruct : firstTextModelId,
    // 切图的图片编辑只能落在 openai 协议模型上；没有这类模型时留空并在切图页提示
    sliceImageEdit: sliceCapableImageModels.some((model) => model.id === defaults.sliceImageEdit)
      ? defaults.sliceImageEdit
      : (sliceCapableImageModels[0]?.id || ''),
  };
}

export function SettingsModal({ isOpen, onClose, onApiKeyChange }: SettingsModalProps) {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const { imageModels, textModels } = useMemo(() => deriveImageAndTextModels(providers), [providers]);
  const [selectedProviderId, setSelectedProviderId] = useState('');
  const [defaults, setDefaults] = useState<DefaultModels>(DEFAULT_DEFAULTS);
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>(DEFAULT_GENERATION_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checkingModels, setCheckingModels] = useState(false);
  const [modelStatuses, setModelStatuses] = useState<ModelStatus[] | null>(null);
  const [modelCheckError, setModelCheckError] = useState<string | null>(null);
  const [twinkleSession, setTwinkleSession] = useState<TwinkleModelSession | null>(null);
  const [twinkleEmail, setTwinkleEmail] = useState('');
  const [twinklePassword, setTwinklePassword] = useState('');
  const [twinkle2FA, setTwinkle2FA] = useState<TwinkleModelLogin2FAChallenge | null>(null);
  const [twinkleTotpCode, setTwinkleTotpCode] = useState('');
  const [twinkleBusy, setTwinkleBusy] = useState(false);
  const [twinkleError, setTwinkleError] = useState<string | null>(null);

  const [backupProgress, setBackupProgress] = useState<BackupProgressType>({ percent: 0, message: '' });
  const [isBackupActive, setIsBackupActive] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const registry = loadRegistry();
    const storedProviders = registry.providers || [];
    const nextProviders = storedProviders.some(provider => provider.id === TWINKLE_MODEL_PROVIDER_ID)
      ? storedProviders
      : [{ id: TWINKLE_MODEL_PROVIDER_ID, name: 'Twinkle Model', kind: 'openai-compatible' as const, apiKey: '', baseUrl: TWINKLE_MODEL_REQUEST_BASE_URL, models: [] }, ...storedProviders];
    setProviders(nextProviders);
    setSelectedProviderId(nextProviders[0]?.id || '');
    setDefaults(normalizeDefaults(registry.defaults, registry.imageModels, registry.textModels));
    setGenerationSettings(registry.generationSettings);
    setError(null);
    setSuccess(null);
    setModelStatuses(null);
    setModelCheckError(null);
    setBackupError(null);
    setBackupSuccess(null);
    setTwinkleSession(loadTwinkleModelSession());
    setTwinkle2FA(null);
    setTwinkleTotpCode('');
    setTwinkleError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || providers.length === 0) return;
    setDefaults((prev) => {
      const next = normalizeDefaults(prev, imageModels, textModels);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
  }, [imageModels, isOpen, providers.length, textModels]);


  const saveProviders = () => {
    const derived = deriveImageAndTextModels(providers);
    const nextDefaults = normalizeDefaults(defaults, derived.imageModels, derived.textModels);
    saveRegistry({ providers, ...derived, defaults: nextDefaults, generationSettings });
    setDefaults(nextDefaults);
    syncDynamicModelExports();
    onApiKeyChange?.(hasAnyApiKey());
    setError(null);
    setSuccess('供应商配置已保存');
  };

  const configureFromTwinkleSession = async (session: TwinkleModelSession) => {
    setTwinkleBusy(true);
    setTwinkleError(null);
    setSuccess(null);
    setError(null);
    try {
      const result = await fetchTwinkleModelDefaultKeys(session);
      const nextRegistry = applyTwinkleModelKeys({
        providers,
        imageModels,
        textModels,
        defaults,
        generationSettings,
      }, result.key);
      saveTwinkleModelSession(result.session);
      saveRegistry(nextRegistry);
      syncDynamicModelExports();
      setTwinkleSession(result.session);
      setProviders(nextRegistry.providers || []);
      setSelectedProviderId(TWINKLE_MODEL_PROVIDER_ID);
      setDefaults(nextRegistry.defaults);
      setTwinklePassword('');
      setTwinkle2FA(null);
      setTwinkleTotpCode('');
      onApiKeyChange?.(hasAnyApiKey());
      setSuccess('已从 Twinkle Model 拉取系统默认密钥并完成三个模型的配置');
      setModelStatuses(null);
      setModelCheckError(null);
    } catch (err) {
      setTwinkleError(err instanceof Error ? err.message : 'Twinkle Model 配置失败');
    } finally {
      setTwinkleBusy(false);
    }
  };

  const handleTwinkleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!twinkleEmail.trim() || !twinklePassword) {
      setTwinkleError('请输入 Twinkle Model 邮箱和密码');
      return;
    }
    setTwinkleBusy(true);
    setTwinkleError(null);
    try {
      const result = await loginTwinkleModel(twinkleEmail.trim(), twinklePassword);
      if (isTwinkleModel2FAChallenge(result)) {
        setTwinkle2FA(result);
        return;
      }
      saveTwinkleModelSession(result);
      setTwinkleSession(result);
      await configureFromTwinkleSession(result);
    } catch (err) {
      setTwinkleError(err instanceof Error ? err.message : 'Twinkle Model 登录失败');
    } finally {
      setTwinkleBusy(false);
    }
  };

  const handleTwinkle2FA = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!twinkle2FA || !/^\d{6}$/.test(twinkleTotpCode)) {
      setTwinkleError('请输入 6 位二次验证码');
      return;
    }
    setTwinkleBusy(true);
    setTwinkleError(null);
    try {
      const session = await completeTwinkleModelLogin2FA(twinkle2FA.tempToken, twinkleTotpCode);
      saveTwinkleModelSession(session);
      setTwinkleSession(session);
      await configureFromTwinkleSession(session);
    } catch (err) {
      setTwinkleError(err instanceof Error ? err.message : 'Twinkle Model 二次验证失败');
    } finally {
      setTwinkleBusy(false);
    }
  };

  const handleTwinkleLogout = async () => {
    const currentSession = twinkleSession;
    clearTwinkleModelSession();
    setTwinkleSession(null);
    setTwinkle2FA(null);
    setTwinkleTotpCode('');
    setTwinklePassword('');
    setTwinkleError(null);
    await logoutTwinkleModel(currentSession);
  };

  const handleCheckModels = async () => {
    const configuredModels = [
      ...imageModels.filter(isCompleteImageModel),
      ...textModels.filter(isCompleteTextModel),
    ];
    if (configuredModels.length === 0) {
      setModelCheckError('请先完成至少一个图片模型或文本模型配置');
      return;
    }

    setCheckingModels(true);
    setModelCheckError(null);
    setModelStatuses(null);
    try {
      const statuses = await checkModelsAvailability(configuredModels.map((model) => model.id));
      setModelStatuses(statuses);
    } catch (err) {
      setModelCheckError(err instanceof Error ? err.message : '检查模型失败');
    } finally {
      setCheckingModels(false);
    }
  };

  const handleExport = async () => {
    setIsBackupActive(true);
    setBackupError(null);
    setBackupSuccess(null);
    try {
      const blob = await exportAllData((progress) => setBackupProgress(progress));
      const filename = generateBackupFilename();
      downloadBlob(blob, filename);
      setBackupSuccess(`数据已成功导出为 ${filename}`);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : '导出失败');
    } finally {
      setIsBackupActive(false);
    }
  };

  const handleImport = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setBackupError('请选择有效的备份文件（.zip 格式）');
      return;
    }

    setIsBackupActive(true);
    setBackupError(null);
    setBackupSuccess(null);
    try {
      await importAllData(file, (progress) => setBackupProgress(progress));
      setBackupSuccess('数据已成功导入，页面将在 2 秒后刷新。');
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : '导入失败');
      setIsBackupActive(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleImport(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const completeImageOptions = imageModels.filter(isCompleteImageModel).map((model) => ({ value: model.id, label: model.name }));
  const completeTextOptions = textModels.filter(isCompleteTextModel).map((model) => ({ value: model.id, label: model.name }));
  // 切图的图片编辑只能落在 openai 协议模型上（带 mask 的 /v1/images/edits）
  const sliceCapableImageOptions = imageModels
    .filter((model) => isCompleteImageModel(model) && isSliceCapableImageModel(model))
    .map((model) => ({ value: model.id, label: model.name }));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && isBackupActive) return;
      if (!open) onClose();
    }}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden bg-card p-0 pt-0 gap-0 sm:max-w-5xl">
        <DialogHeader className="p-4 pb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-muted-foreground" />
            <DialogTitle>设置</DialogTitle>
          </div>
          <DialogDescription>在供应商下统一管理密钥和模型。登录 Twinkle Model 可自动完成配置，也可以连接自己的供应商。</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="models" className="min-h-0 flex-1 gap-0">
          <TabsList className="w-full rounded-none border-b bg-transparent h-auto p-0">
            <TabsTrigger value="models" className="gap-2 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent data-active:shadow-none px-4 py-3">
              <ImageIcon className="w-4 h-4" />
              模型配置
            </TabsTrigger>
            <TabsTrigger value="backup" className="gap-2 rounded-none border-b-2 border-transparent data-active:border-primary data-active:bg-transparent data-active:shadow-none px-4 py-3">
              <Database className="w-4 h-4" />
              备份
            </TabsTrigger>
          </TabsList>

          <TabsContent value="models" className="mt-0 flex min-h-0 flex-col">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card p-4 sm:px-6">
              <div className="space-y-1">
                <p className="text-sm font-medium">供应商与模型</p>
                <p className="text-xs text-muted-foreground">先连接供应商，再添加模型并选择用途。同一供应商的模型共用密钥。</p>
              </div>
              <Button onClick={saveProviders} className="gap-2" disabled={twinkleBusy}>
                <Save className="w-4 h-4" />
                保存设置
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
              {error && <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
              {success && <div role="status" className="rounded-lg border border-success/25 bg-success/10 p-3 text-sm text-success">{success}</div>}

              <ProviderSettingsPanel
                key={selectedProviderId}
                providers={providers}
                selectedProviderId={selectedProviderId}
                onChange={setProviders}
                onSelect={setSelectedProviderId}
                accountPanel={
                  <div className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                          <KeyRound className="size-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium">Twinkle Model</p>
                          <p className="text-xs text-muted-foreground">登录后读取“系统默认密钥”，自动添加 GPT Image 2、Banana Pro 和 gpt-5.6-sol。</p>
                        </div>
                      </div>
                      <a
                        href={TWINKLE_MODEL_ACCOUNT_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                      >
                        用户中心
                        <ExternalLink className="size-3.5" />
                      </a>
                    </div>

                    {twinkleSession ? (
                      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{twinkleSession.user.username || twinkleSession.user.email}</p>
                          <p className="truncate text-xs text-muted-foreground">{twinkleSession.user.email}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            disabled={twinkleBusy}
                            onClick={() => configureFromTwinkleSession(twinkleSession)}
                          >
                            {twinkleBusy ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                            重新拉取并配置
                          </Button>
                          <Button type="button" variant="outline" size="sm" className="gap-2" onClick={handleTwinkleLogout}>
                            <LogOut className="size-4" />
                            退出登录
                          </Button>
                        </div>
                      </div>
                    ) : twinkle2FA ? (
                      <form className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={handleTwinkle2FA}>
                        <div className="space-y-2">
                          <label htmlFor="twinkle-model-totp" className="text-xs text-muted-foreground">二次验证码（{twinkle2FA.userEmailMasked}）</label>
                          <Input
                            id="twinkle-model-totp"
                            value={twinkleTotpCode}
                            onChange={(event) => setTwinkleTotpCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <Button type="submit" className="gap-2" disabled={twinkleBusy}>
                            {twinkleBusy ? <LoaderCircle className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                            验证并配置
                          </Button>
                          <Button type="button" variant="outline" onClick={() => setTwinkle2FA(null)}>返回</Button>
                        </div>
                      </form>
                    ) : (
                      <form className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]" onSubmit={handleTwinkleLogin}>
                        <div className="space-y-2">
                          <label htmlFor="twinkle-model-email" className="text-xs text-muted-foreground">邮箱</label>
                          <Input
                            id="twinkle-model-email"
                            type="email"
                            required
                            value={twinkleEmail}
                            onChange={(event) => setTwinkleEmail(event.target.value)}
                            autoComplete="username"
                          />
                        </div>
                        <div className="space-y-2">
                          <label htmlFor="twinkle-model-password" className="text-xs text-muted-foreground">密码</label>
                          <Input
                            id="twinkle-model-password"
                            type="password"
                            required
                            value={twinklePassword}
                            onChange={(event) => setTwinklePassword(event.target.value)}
                            autoComplete="current-password"
                          />
                        </div>
                        <div className="flex items-end">
                          <Button type="submit" className="w-full gap-2 md:w-auto" disabled={twinkleBusy}>
                            {twinkleBusy ? <LoaderCircle className="size-4 animate-spin" /> : <LogIn className="size-4" />}
                            登录并配置
                          </Button>
                        </div>
                      </form>
                    )}

                    {twinkleError && (
                      <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                        {twinkleError}
                      </div>
                    )}
                    <p className="mt-3 text-xs text-muted-foreground">退出登录不会删除已配置的模型；也可直接在下方手动填写。</p>
                  </div>
                }
              />


              <div className="rounded-xl border p-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">默认模型</p>
                    <p className="text-xs text-muted-foreground">从供应商已配置的模型中选择；修改后点击「保存设置」生效。</p>
                  </div>
                  <Button variant="outline" size="sm" className="gap-2" onClick={handleCheckModels} disabled={checkingModels}>
                    <RefreshCw className={`w-4 h-4 ${checkingModels ? 'animate-spin' : ''}`} />
                    {checkingModels ? '检查中...' : '检查模型'}
                  </Button>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">文生图默认模型</label>
                    <Select ariaLabel="文生图默认模型" value={defaults.textToImage} onValueChange={(value) => setDefaults((prev) => ({ ...prev, textToImage: value }))} options={completeImageOptions} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">图生图默认模型</label>
                    <Select ariaLabel="图生图默认模型" value={defaults.imageToImage} onValueChange={(value) => setDefaults((prev) => ({ ...prev, imageToImage: value }))} options={completeImageOptions} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">反推提示词默认模型</label>
                    <Select ariaLabel="反推提示词默认模型" value={defaults.reversePrompt} onValueChange={(value) => setDefaults((prev) => ({ ...prev, reversePrompt: value }))} options={completeTextOptions} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">Agent 默认模型</label>
                    <Select ariaLabel="Agent 默认模型" value={defaults.agent} onValueChange={(value) => setDefaults((prev) => ({ ...prev, agent: value }))} options={completeTextOptions} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">提示词优化默认模型</label>
                    <Select ariaLabel="提示词优化默认模型" value={defaults.promptOptimize} onValueChange={(value) => setDefaults((prev) => ({ ...prev, promptOptimize: value }))} options={completeTextOptions} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">图片描述默认模型</label>
                    <Select ariaLabel="图片描述默认模型" value={defaults.imageDescribe} onValueChange={(value) => setDefaults((prev) => ({ ...prev, imageDescribe: value }))} options={completeTextOptions} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">AI 拆图默认模型</label>
                    <Select ariaLabel="AI 拆图默认模型" value={defaults.sliceDecomposition} onValueChange={(value) => setDefaults((prev) => ({ ...prev, sliceDecomposition: value }))} options={completeTextOptions} />
                    <p className="text-[11px] text-muted-foreground">UI设计模式：识别切片与背景候选，需要视觉能力</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">网页复刻默认模型</label>
                    <Select ariaLabel="网页复刻默认模型" value={defaults.sliceReconstruct} onValueChange={(value) => setDefaults((prev) => ({ ...prev, sliceReconstruct: value }))} options={completeTextOptions} />
                    <p className="text-[11px] text-muted-foreground">UI设计模式：多轮工具调用生成网页，建议用能力更强的模型</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs text-muted-foreground">切图图片编辑默认模型</label>
                    <Select ariaLabel="切图图片编辑默认模型" value={defaults.sliceImageEdit} onValueChange={(value) => setDefaults((prev) => ({ ...prev, sliceImageEdit: value }))} options={sliceCapableImageOptions} />
                    <p className="text-[11px] text-muted-foreground">
                      {sliceCapableImageOptions.length === 0
                        ? '需要一个 OpenAI 协议的图片模型；Gemini / Grok 不支持带蒙版的局部编辑'
                        : 'AI 透明化与背景补齐使用，仅支持 OpenAI 协议'}
                    </p>
                  </div>
                </div>

                {modelCheckError && <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{modelCheckError}</div>}
                {modelStatuses && (
                  <div className="grid gap-2 md:grid-cols-2">
                    {modelStatuses.map((status) => (
                      <div key={status.modelId} className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <div className="truncate font-medium">{getTextModelLabel(textModels, status.modelId) ?? getImageModelLabel(imageModels, status.modelId) ?? status.actualName ?? status.modelId}</div>
                          <div className="truncate text-xs text-muted-foreground">{status.message || status.actualName || status.modelId}</div>
                        </div>
                        {status.available ? <CheckCircle2 className="w-4 h-4 text-success" /> : <XCircle className="w-4 h-4 text-destructive" />}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl border p-4 space-y-4">
                <div>
                  <p className="font-medium">失败重试</p>
                  <p className="text-xs text-muted-foreground">单张图片首次生成失败后自动重试，成功后立即停止。重试会产生额外的 API 请求。</p>
                </div>
                <div className="max-w-xs space-y-2">
                  <label htmlFor="image-generation-max-retries" className="text-xs text-muted-foreground">最大重试次数</label>
                  <Input
                    id="image-generation-max-retries"
                    type="number"
                    min={0}
                    max={MAX_IMAGE_GENERATION_RETRIES}
                    step={1}
                    value={generationSettings.maxRetries}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (!Number.isFinite(next)) return;
                      setGenerationSettings({
                        maxRetries: Math.min(MAX_IMAGE_GENERATION_RETRIES, Math.max(0, Math.floor(next))),
                      });
                    }}
                  />
                  <p className="text-xs text-muted-foreground">默认 3 次；设为 0 可关闭自动重试。</p>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="backup" className="min-h-0 overflow-y-auto p-4 sm:p-6 space-y-6 mt-0">
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-base font-medium">数据备份与恢复</h3>
                <p className="text-sm text-muted-foreground">导出所有数据（模型配置、任务历史、设置、图片）为 ZIP 压缩包，或从备份文件恢复数据。</p>
              </div>

              <BackupProgress percent={backupProgress.percent} message={backupProgress.message} isActive={isBackupActive} />

              {backupSuccess && !isBackupActive && (
                <div className="flex items-start gap-3 rounded-lg border border-success/25 bg-success/10 p-4">
                  <CheckCircle2 className="mt-0.5 w-5 h-5 flex-shrink-0 text-success" />
                  <p className="text-sm text-success">{backupSuccess}</p>
                </div>
              )}

              {backupError && !isBackupActive && (
                <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
                  <XCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive break-all">{backupError}</p>
                </div>
              )}

              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <Download className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <h4 className="font-medium">导出数据</h4>
                    <p className="text-sm text-muted-foreground">将所有数据打包为 ZIP 文件下载到本地。备份文件包含模型配置和本地记录，请自行保管。</p>
                    <Button onClick={handleExport} disabled={isBackupActive} className="gap-2">
                      <Download className="w-4 h-4" />
                      全量备份
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <Upload className="w-5 h-5 text-muted-foreground mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <h4 className="font-medium">导入数据</h4>
                    <p className="text-sm text-muted-foreground">从备份文件恢复数据。<span className="font-medium text-destructive">警告：这会覆盖现有数据。</span></p>
                    <input ref={fileInputRef} type="file" accept=".zip" onChange={handleFileSelect} className="hidden" />
                    <Button onClick={() => fileInputRef.current?.click()} disabled={isBackupActive} variant="outline" className="gap-2">
                      <Upload className="w-4 h-4" />
                      选择备份文件
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="about" className="min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 mt-0">
            <div className="space-y-4 text-sm">
              <h3 className="text-lg font-medium">Nova Image <span className="text-xs text-muted-foreground font-normal">v{process.env.NEXT_PUBLIC_APP_VERSION}</span></h3>
              <p className="text-sm text-muted-foreground">
                项目地址：
                {' '}
                <a
                  href="https://github.com/tianjiangqiji/nova-image-studio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  tianjiangqiji/nova-image-studio <ExternalLink className="w-3 h-3" />
                </a>
              </p>

              <details className="group rounded-lg bg-muted/50 p-3">
                <summary className="flex cursor-pointer select-none items-center gap-2 font-medium">
                  <span className="text-[10px] opacity-60 transition-transform group-open:rotate-90">▶</span>
                  使用方法
                </summary>
                <ol className="mt-3 list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>先完成至少一个图片模型和一个文本模型的全部信息。</li>
                  <li>保存后，外部工作区只会显示这些配置完整的模型。</li>
                  <li>再为各工作流指定默认模型，即可开始生图、反推或 Agent 工作流。</li>
                </ol>
              </details>

              <details className="group rounded-lg bg-muted/50 p-3">
                <summary className="flex cursor-pointer select-none items-center gap-2 font-medium">
                  <span className="text-[10px] opacity-60 transition-transform group-open:rotate-90">▶</span>
                  数据来源
                </summary>
                <ul className="mt-3 list-disc list-inside space-y-2 text-muted-foreground">
                  <li>
                    <span className="text-foreground">提示词广场</span> - 提示词来源：
                    <ul className="mt-1 ml-5 list-disc list-inside space-y-1">
                      {PROMPT_DATA_SOURCES.map((source) => (
                        <li key={source.name}>
                          <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                            {getPromptSourceLabel(source.sourceUrl)} <ExternalLink className="w-3 h-3" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </li>
                  <li>
                    <span className="text-foreground">随机图片 · BA人物</span> -{' '}
                    <a href={BA_RANDOM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      img.catcdn.cn <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                  <li>
                    <span className="text-foreground">随机图片 · Bing壁纸</span> -{' '}
                    <a href={BING_WALLPAPER_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      bing.img.run <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                </ul>
              </details>

              <details className="group rounded-lg bg-muted/50 p-3">
                <summary className="flex cursor-pointer select-none items-center gap-2 font-medium">
                  <span className="text-[10px] opacity-60 transition-transform group-open:rotate-90">▶</span>
                  隐私条款
                </summary>
                <ul className="mt-3 list-disc list-inside space-y-2 text-muted-foreground">
                  <li>本站为本地优先应用：模型配置、任务历史、设置与生成图片默认保存在你的浏览器本地。</li>
                  <li>每个模型的 API Key 和 Base URL 仅用于调用你自己配置的上游服务。</li>
                  <li>生图、反推、Agent、提示词优化等功能会把你当前选择的提示词、参考图或对话内容发送到对应模型配置的上游接口。</li>
                  <li>UI设计模式会把源图截图、切图资产总览图与对话内容发送到你配置的文本/图片模型；切图工作区与图片数据只存在本地 IndexedDB。</li>
                  <li>备份文件可能包含模型配置、本地任务记录与图片数据，请自行妥善保管。</li>
                </ul>
              </details>

              <details className="group rounded-lg bg-muted/50 p-3">
                <summary className="flex cursor-pointer select-none items-center gap-2 font-medium">
                  <span className="text-[10px] opacity-60 transition-transform group-open:rotate-90">▶</span>
                  参考项目
                </summary>
                <ul className="mt-3 list-disc list-inside space-y-2 text-muted-foreground">
                  <li>
                    项目仓库：
                    {' '}
                    <a href="https://github.com/tianjiangqiji/nova-image-studio" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      tianjiangqiji/nova-image-studio <ExternalLink className="w-3 h-3" />
                    </a>
                  </li>
                  <li>
                    基于
                    {' '}
                    <a href="https://github.com/aaronkwhite/nanobanana-studio-web" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      aaronkwhite/nanobanana-studio-web <ExternalLink className="w-3 h-3" />
                    </a>
                    {' '}
                    修改而来。
                  </li>
                  <li>
                    无限画布工作区参考
                    {' '}
                    <a href="https://github.com/basketikun/infinite-canvas" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      basketikun/infinite-canvas <ExternalLink className="w-3 h-3" />
                    </a>
                    。
                  </li>
                  <li>
                    UI设计模式（图片切图）参考
                    {' '}
                    <a href="https://github.com/50kg/image-to-slice" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      50kg/image-to-slice <ExternalLink className="w-3 h-3" />
                    </a>
                    {' '}
                    实现。原项目是 Figma 插件，本项目移植了其中与 Figma 无关的核心切图流程。
                  </li>
                  <li>
                    切图的本地 SVG 矢量化基于
                    {' '}
                    <a href="https://github.com/jankovicsandras/imagetracerjs" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                      jankovicsandras/imagetracerjs <ExternalLink className="w-3 h-3" />
                    </a>
                    。
                  </li>
                </ul>
              </details>
            </div>
           </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
