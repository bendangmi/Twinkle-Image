'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  ImageIcon,
  KeyRound,
  LoaderCircle,
  LogIn,
  LogOut,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Upload,
  Wand2,
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
import { Switch } from '@/components/ui/switch';
import { BackupProgress } from '@/components/BackupProgress';
import {
  BUILTIN_IMAGE_PRESETS,
  BUILTIN_IMAGE_PRESET_OPTIONS,
  DEFAULT_DEFAULTS,
  DEFAULT_GENERATION_SETTINGS,
  DEFAULT_TEXT_MODEL_TEMPLATES,
  MAX_IMAGE_GENERATION_RETRIES,
  generateModelId,
  getDefaultTextModelTemplate,
  getCompleteImageModels,
  getCompleteTextModels,
  getImageModelOutputSizes,
  loadRegistry,
  saveRegistry,
  type DefaultModels,
  type GenerationSettings,
  type ImageModelConfig,
  type ProviderProtocol,
  type TextModelConfig,
} from '@/lib/nova-models';
import {
  getTextProviderDescription,
  getTextProviderLabel,
  type TextProviderProtocol,
} from '@/lib/nova-text-protocol';
import { syncDynamicModelExports } from '@/lib/gemini-config';
import { exportAllData, importAllData, downloadBlob, generateBackupFilename, type BackupProgress as BackupProgressType } from '@/lib/backup-utils';
import { checkModelsAvailability, type ModelStatus } from '@/lib/ccode-task-client';
import { hasAnyApiKey } from '@/lib/settings-storage';
import {
  TWINKLE_MODEL_ACCOUNT_URL,
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

function cloneImageModel(model: ImageModelConfig): ImageModelConfig {
  return { ...model };
}

function cloneTextModel(model: TextModelConfig): TextModelConfig {
  return { ...model };
}

function createImageModelDraft(): ImageModelConfig {
  const preset = BUILTIN_IMAGE_PRESETS['gpt-image-2'];
  return {
    id: generateModelId('img'),
    protocol: preset.protocol,
    name: preset.name,
    modelId: preset.modelId,
    apiKey: '',
    baseUrl: preset.baseUrl,
    builtinPreset: preset.id,
    maxRefImages: preset.maxRefImages,
    maxOutputSize: preset.maxOutputSize,
    supportsAdvancedParams: preset.supportsAdvancedParams,
  };
}

function createTextModelDraft(): TextModelConfig {
  const template = getDefaultTextModelTemplate('openai-responses');
  return {
    id: generateModelId('txt'),
    protocol: template.protocol,
    name: template.name,
    modelId: template.modelId,
    apiKey: '',
    baseUrl: template.baseUrl,
    note: template.note,
  };
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
  const firstImageModelId = completeImageModels[0]?.id || '';
  const firstTextModelId = completeTextModels[0]?.id || '';

  return {
    textToImage: firstImageModelId,
    imageToImage: firstImageModelId,
    reversePrompt: completeTextModels.some((model) => model.id === defaults.reversePrompt) ? defaults.reversePrompt : firstTextModelId,
    agent: completeTextModels.some((model) => model.id === defaults.agent) ? defaults.agent : firstTextModelId,
    promptOptimize: completeTextModels.some((model) => model.id === defaults.promptOptimize) ? defaults.promptOptimize : firstTextModelId,
    imageDescribe: completeTextModels.some((model) => model.id === defaults.imageDescribe) ? defaults.imageDescribe : firstTextModelId,
  };
}

export function SettingsModal({ isOpen, onClose, onApiKeyChange }: SettingsModalProps) {
  const [imageModels, setImageModels] = useState<ImageModelConfig[]>([]);
  const [textModels, setTextModels] = useState<TextModelConfig[]>([]);
  const [defaults, setDefaults] = useState<DefaultModels>(DEFAULT_DEFAULTS);
  const [generationSettings, setGenerationSettings] = useState<GenerationSettings>(DEFAULT_GENERATION_SETTINGS);
  const [selectedImageModelId, setSelectedImageModelId] = useState('');
  const [selectedTextModelId, setSelectedTextModelId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [checkingModels, setCheckingModels] = useState(false);
  const [modelStatuses, setModelStatuses] = useState<ModelStatus[] | null>(null);
  const [modelCheckError, setModelCheckError] = useState<string | null>(null);
  const [showImageApiKey, setShowImageApiKey] = useState(false);
  const [showTextApiKey, setShowTextApiKey] = useState(false);
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
    setImageModels(registry.imageModels.map(cloneImageModel));
    setTextModels(registry.textModels.map(cloneTextModel));
    setDefaults(normalizeDefaults(registry.defaults, registry.imageModels, registry.textModels));
    setGenerationSettings(registry.generationSettings);
    setSelectedImageModelId(registry.imageModels[0]?.id || '');
    setSelectedTextModelId(registry.textModels[0]?.id || '');
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
    if (!isOpen) return;
    setDefaults((prev) => {
      const next = normalizeDefaults(prev, imageModels, textModels);
      return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
    });
  }, [imageModels, isOpen, textModels]);

  const selectedImageModel = useMemo(
    () => imageModels.find((model) => model.id === selectedImageModelId) || null,
    [imageModels, selectedImageModelId],
  );
  const selectedTextModel = useMemo(
    () => textModels.find((model) => model.id === selectedTextModelId) || null,
    [selectedTextModelId, textModels],
  );

  const handleAddImageModel = () => {
    const draft = createImageModelDraft();
    setImageModels((prev) => [...prev, draft]);
    setSelectedImageModelId(draft.id);
  };

  const handleUpdateImageModel = (id: string, patch: Partial<ImageModelConfig>) => {
    setImageModels((prev) => prev.map((model) => {
      if (model.id !== id) return model;
      const next = { ...model, ...patch };
      if (patch.builtinPreset) {
        const preset = BUILTIN_IMAGE_PRESETS[patch.builtinPreset];
        next.protocol = preset.protocol;
        next.name = preset.name;
        next.modelId = preset.modelId;
        next.baseUrl = preset.baseUrl;
        next.maxRefImages = preset.maxRefImages;
        next.maxOutputSize = preset.maxOutputSize;
        next.supportsAdvancedParams = preset.supportsAdvancedParams;
      }
      if (patch.protocol === 'google' || patch.protocol === 'grok') {
        next.supportsAdvancedParams = false;
      }
      return next;
    }));
  };

  const handleDeleteImageModel = (id: string) => {
    const nextModels = imageModels.filter((model) => model.id !== id);
    setImageModels(nextModels);
    setDefaults((prev) => ({
      ...prev,
      textToImage: prev.textToImage === id ? '' : prev.textToImage,
      imageToImage: prev.imageToImage === id ? '' : prev.imageToImage,
    }));
    if (selectedImageModelId === id) {
      setSelectedImageModelId(nextModels[0]?.id || '');
    }
  };

  const handleAddTextModel = () => {
    const draft = createTextModelDraft();
    setTextModels((prev) => [...prev, draft]);
    setSelectedTextModelId(draft.id);
  };

  const handleApplyTextTemplate = (id: string, protocol: TextProviderProtocol) => {
    const template = getDefaultTextModelTemplate(protocol);
    handleUpdateTextModel(id, {
      protocol: template.protocol,
      name: template.name,
      modelId: template.modelId,
      baseUrl: template.baseUrl,
      note: template.note || getTextProviderDescription(template.protocol),
    });
  };

  const handleUpdateTextModel = (id: string, patch: Partial<TextModelConfig>) => {
    setTextModels((prev) => prev.map((model) => (model.id === id ? { ...model, ...patch } : model)));
  };

  const handleDeleteTextModel = (id: string) => {
    const nextModels = textModels.filter((model) => model.id !== id);
    setTextModels(nextModels);
    setDefaults((prev) => ({
      ...prev,
      reversePrompt: prev.reversePrompt === id ? '' : prev.reversePrompt,
      agent: prev.agent === id ? '' : prev.agent,
      promptOptimize: prev.promptOptimize === id ? '' : prev.promptOptimize,
      imageDescribe: prev.imageDescribe === id ? '' : prev.imageDescribe,
    }));
    if (selectedTextModelId === id) {
      setSelectedTextModelId(nextModels[0]?.id || '');
    }
  };

  const persistRegistry = () => {
    if (imageModels.length === 0) {
      setError('至少填写一个图片模型');
      return;
    }
    if (textModels.length === 0) {
      setError('至少填写一个文本模型');
      return;
    }
    if (!imageModels.some(isCompleteImageModel)) {
      setError('至少完成一个图片模型的全部信息');
      return;
    }
    if (!textModels.some(isCompleteTextModel)) {
      setError('至少完成一个文本模型的全部信息');
      return;
    }

    const registry = {
      imageModels,
      textModels,
      defaults: normalizeDefaults(defaults, imageModels, textModels),
      generationSettings,
    };

    saveRegistry(registry);
    syncDynamicModelExports();
    window.dispatchEvent(new Event('nova-model-registry-updated'));
    onApiKeyChange?.(hasAnyApiKey());
    setSuccess('设置已保存');
    setError(null);
    setModelStatuses(null);
    setModelCheckError(null);
  };

  const configureFromTwinkleSession = async (session: TwinkleModelSession) => {
    setTwinkleBusy(true);
    setTwinkleError(null);
    setSuccess(null);
    setError(null);
    try {
      const result = await fetchTwinkleModelDefaultKeys(session);
      const nextRegistry = applyTwinkleModelKeys({
        imageModels,
        textModels,
        defaults,
        generationSettings,
      }, result.keys);
      saveTwinkleModelSession(result.session);
      saveRegistry(nextRegistry);
      syncDynamicModelExports();
      setTwinkleSession(result.session);
      setImageModels(nextRegistry.imageModels.map(cloneImageModel));
      setTextModels(nextRegistry.textModels.map(cloneTextModel));
      setDefaults(nextRegistry.defaults);
      setSelectedImageModelId(nextRegistry.imageModels[0]?.id || '');
      setSelectedTextModelId(nextRegistry.textModels[0]?.id || '');
      setTwinklePassword('');
      setTwinkle2FA(null);
      setTwinkleTotpCode('');
      window.dispatchEvent(new Event('nova-model-registry-updated'));
      onApiKeyChange?.(hasAnyApiKey());
      setSuccess('已从 Twinkle Model 拉取默认密钥并完成三个模型的配置');
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
  const selectedImageOutputSizes = selectedImageModel
    ? getImageModelOutputSizes({
        ...selectedImageModel,
        maxOutputSize: BUILTIN_IMAGE_PRESETS[selectedImageModel.builtinPreset].maxOutputSize,
      })
    : ['1K'];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && isBackupActive) return;
      if (!open) onClose();
    }}>
      <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden p-0 pt-0 gap-0 sm:max-w-5xl">
        <DialogHeader className="p-4 pb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-muted-foreground" />
            <DialogTitle>设置</DialogTitle>
          </div>
          <DialogDescription>按模型分别配置协议、URL 和 API Key。至少完成一个图片模型和一个文本模型后，外部功能才会解锁。</DialogDescription>
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

          <TabsContent value="models" className="min-h-0 overflow-y-auto p-4 sm:p-6 mt-0 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium">模型级独立配置</p>
                <p className="text-xs text-muted-foreground">每个模型单独记录协议、Base URL、API Key。外部只显示配置完整的模型。</p>
              </div>
              <Button onClick={persistRegistry} className="gap-2">
                <Save className="w-4 h-4" />
                保存设置
              </Button>
            </div>

            {error && <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            {success && <div className="rounded-lg border border-success/25 bg-success/10 p-3 text-sm text-success">{success}</div>}

            <div className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                    <KeyRound className="size-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">Twinkle Model</p>
                    <p className="text-xs text-muted-foreground">登录后自动配置 GPT Image 2、Banana Pro 和 gpt-5.5。</p>
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

            <div className="rounded-xl border p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">图片模型</p>
                  <p className="text-xs text-muted-foreground">已预置名称、模型 ID 和 Base URL，只需补充 API Key。</p>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={handleAddImageModel}>
                  <Plus className="w-4 h-4" />
                  新增图片模型
                </Button>
              </div>

              <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-2">
                  {imageModels.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setSelectedImageModelId(model.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedImageModelId === model.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                    >
                      <div className="font-medium">{model.name || '未命名模型'}</div>
                      <div className="text-xs text-muted-foreground">{isCompleteImageModel(model) ? '配置完成' : '待补全'}</div>
                    </button>
                  ))}
                </div>

                {selectedImageModel && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">内置模板</label>
                      <Select
                        value={selectedImageModel.builtinPreset}
                        onValueChange={(value) => handleUpdateImageModel(selectedImageModel.id, { builtinPreset: value as ImageModelConfig['builtinPreset'] })}
                        options={BUILTIN_IMAGE_PRESET_OPTIONS}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">协议</label>
                      <Select
                        value={selectedImageModel.protocol}
                        onValueChange={(value) => handleUpdateImageModel(selectedImageModel.id, { protocol: value as ProviderProtocol })}
                        options={[
                          { value: 'google', label: 'Google' },
                          { value: 'openai', label: 'OpenAI Images' },
                          { value: 'grok', label: 'Grok Images' },
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">显示名称</label>
                      <Input value={selectedImageModel.name} onChange={(event) => handleUpdateImageModel(selectedImageModel.id, { name: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">模型 ID</label>
                      <Input value={selectedImageModel.modelId} onChange={(event) => handleUpdateImageModel(selectedImageModel.id, { modelId: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Base URL</label>
                      <Input value={selectedImageModel.baseUrl} onChange={(event) => handleUpdateImageModel(selectedImageModel.id, { baseUrl: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">API Key</label>
                      <div className="relative">
                        <Input
                          type={showImageApiKey ? "text" : "password"}
                          value={selectedImageModel.apiKey}
                          onChange={(event) => handleUpdateImageModel(selectedImageModel.id, { apiKey: event.target.value })}
                          className="pr-8"
                        />
                        <button
                          type="button"
                          onClick={() => setShowImageApiKey(!showImageApiKey)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          tabIndex={-1}
                        >
                          {showImageApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">最大参考图数量</label>
                      <Input
                        type="number"
                        min={0}
                        value={selectedImageModel.maxRefImages}
                        onChange={(event) => {
                          const next = Number(event.target.value);
                          handleUpdateImageModel(selectedImageModel.id, {
                            maxRefImages: Number.isFinite(next) && next >= 0 ? Math.floor(next) : 0,
                          });
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">最大分辨率</label>
                      <Select
                        value={selectedImageModel.maxOutputSize}
                        onValueChange={(value) => handleUpdateImageModel(selectedImageModel.id, { maxOutputSize: value as ImageModelConfig['maxOutputSize'] })}
                        options={selectedImageOutputSizes.map((size) => ({ value: size, label: size === '512' ? '0.5K' : size }))}
                      />
                    </div>
                    {selectedImageModel.protocol === 'openai' && (
                      <div className="flex items-center justify-between rounded-lg border px-3 py-2 md:col-span-2">
                        <div>
                          <p className="text-sm font-medium">Image 2 额外参数</p>
                          <p className="text-xs text-muted-foreground">透明度、质量、风格控件默认开启，用户可手动关闭。</p>
                        </div>
                        <Switch
                          checked={selectedImageModel.supportsAdvancedParams}
                          onCheckedChange={(checked) => handleUpdateImageModel(selectedImageModel.id, { supportsAdvancedParams: checked })}
                        />
                      </div>
                    )}
                    <div className="md:col-span-2 flex justify-end">
                      <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={() => handleDeleteImageModel(selectedImageModel.id)}>
                        <Trash2 className="w-4 h-4" />
                        删除模型
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">文本模型</p>
                  <p className="text-xs text-muted-foreground">已预置名称、模型 ID 和 Base URL，只需补充 API Key。</p>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={handleAddTextModel}>
                  <Plus className="w-4 h-4" />
                  新增文本模型
                </Button>
              </div>

              <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)]">
                <div className="space-y-2">
                  {textModels.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => setSelectedTextModelId(model.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${selectedTextModelId === model.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
                    >
                      <div className="font-medium">{model.name || '未命名模型'}</div>
                      <div className="text-xs text-muted-foreground">{isCompleteTextModel(model) ? '配置完成' : '待补全'}</div>
                    </button>
                  ))}
                </div>

                {selectedTextModel && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">协议</label>
                      <Select
                        value={selectedTextModel.protocol}
                        onValueChange={(value) => {
                          const protocol = value as TextProviderProtocol;
                          handleUpdateTextModel(selectedTextModel.id, { protocol });
                          handleApplyTextTemplate(selectedTextModel.id, protocol);
                        }}
                        options={[
                          { value: 'openai-responses', label: getTextProviderLabel('openai-responses') },
                          { value: 'openai-chat-completions', label: getTextProviderLabel('openai-chat-completions') },
                          { value: 'anthropic-messages', label: getTextProviderLabel('anthropic-messages') },
                          { value: 'google-gemini', label: getTextProviderLabel('google-gemini') },
                        ]}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">显示名称</label>
                      <Input value={selectedTextModel.name} onChange={(event) => handleUpdateTextModel(selectedTextModel.id, { name: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">模型 ID</label>
                      <Input value={selectedTextModel.modelId} onChange={(event) => handleUpdateTextModel(selectedTextModel.id, { modelId: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">Base URL</label>
                      <Input value={selectedTextModel.baseUrl} onChange={(event) => handleUpdateTextModel(selectedTextModel.id, { baseUrl: event.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">API Key</label>
                      <div className="relative">
                        <Input
                          type={showTextApiKey ? "text" : "password"}
                          value={selectedTextModel.apiKey}
                          onChange={(event) => handleUpdateTextModel(selectedTextModel.id, { apiKey: event.target.value })}
                          className="pr-8"
                        />
                        <button
                          type="button"
                          onClick={() => setShowTextApiKey(!showTextApiKey)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          tabIndex={-1}
                        >
                          {showTextApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-xs text-muted-foreground">协议描述</label>
                      <Input value={selectedTextModel.note || ''} onChange={(event) => handleUpdateTextModel(selectedTextModel.id, { note: event.target.value })} />
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                      <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={() => handleDeleteTextModel(selectedTextModel.id)}>
                        <Trash2 className="w-4 h-4" />
                        删除模型
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border p-4 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">默认模型</p>
                  <p className="text-xs text-muted-foreground">这里只会显示已经配置完整的模型。</p>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={handleCheckModels} disabled={checkingModels}>
                  <RefreshCw className={`w-4 h-4 ${checkingModels ? 'animate-spin' : ''}`} />
                  {checkingModels ? '检查中...' : '检查模型'}
                </Button>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">文生图默认模型</label>
                  <Select value={defaults.textToImage} onValueChange={(value) => setDefaults((prev) => ({ ...prev, textToImage: value }))} options={completeImageOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">图生图默认模型</label>
                  <Select value={defaults.imageToImage} onValueChange={(value) => setDefaults((prev) => ({ ...prev, imageToImage: value }))} options={completeImageOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">反推提示词默认模型</label>
                  <Select value={defaults.reversePrompt} onValueChange={(value) => setDefaults((prev) => ({ ...prev, reversePrompt: value }))} options={completeTextOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">Agent 默认模型</label>
                  <Select value={defaults.agent} onValueChange={(value) => setDefaults((prev) => ({ ...prev, agent: value }))} options={completeTextOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">提示词优化默认模型</label>
                  <Select value={defaults.promptOptimize} onValueChange={(value) => setDefaults((prev) => ({ ...prev, promptOptimize: value }))} options={completeTextOptions} />
                </div>
                <div className="space-y-2">
                  <label className="text-xs text-muted-foreground">图片描述默认模型</label>
                  <Select value={defaults.imageDescribe} onValueChange={(value) => setDefaults((prev) => ({ ...prev, imageDescribe: value }))} options={completeTextOptions} />
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

        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
