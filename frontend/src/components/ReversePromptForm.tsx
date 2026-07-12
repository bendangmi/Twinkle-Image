'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronRight,
  CloudUpload,
  Copy,
  Info,
  Loader2,
  ScanSearch,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AttachmentChips } from '@/components/AttachmentChips';
import { MissingApiKeyDialog } from '@/components/MissingApiKeyDialog';
import { cn } from '@/lib/utils';
import { prepareUploadImage } from '@/lib/upload-image-cache';
import { streamReversePrompt, type StreamReverseHandle } from '@/lib/reverse-prompt-client';
import {
  DEFAULT_REVERSE_MODE,
  getDefaultReversePromptModelId,
  REVERSE_PROMPT_MODE_OPTIONS,
  getReversePromptModelOptionsList,
  getReverseModelOption,
  getReverseModeOption,
  isReversePromptMode,
  isReversePromptModel,
  type ReversePromptMode,
  type ReversePromptModelId,
} from '@/lib/reverse-prompt-config';
import { getConfiguredTextModel } from '@/lib/model-endpoints';
import {
  clearReverseDraft,
  loadReverseResults,
  saveReverseDraft,
  saveReverseResult,
} from '@/lib/reverse-prompt-store';

import { MAX_UPLOAD_SIZE_BYTES } from '@/lib/constants';
import { loadJsonFromStorage, saveJsonToStorage } from '@/lib/settings-storage';

const REVERSE_SETTINGS_KEY = 'nova-reverse-prompt-settings';

interface ReverseSettings {
  model: ReversePromptModelId;
  mode: ReversePromptMode;
}

interface UploadedFile {
  id: string;
  name: string;
  preview: string;
  dataUrl: string;
  mimeType: string;
  badge?: string;
}

interface ReverseResult {
  text: string;
  model: ReversePromptModelId;
  mode: ReversePromptMode;
  finished: boolean; // 是否流式已结束
  aborted?: boolean;
}

function getOptimizationBadge(originalSize: number, processedSize: number, cacheHit: boolean): string | undefined {
  if (cacheHit) return '缓存';
  if (originalSize <= 0 || processedSize >= originalSize) return undefined;
  const savedPercent = Math.round((1 - processedSize / originalSize) * 100);
  return savedPercent >= 5 ? `-${savedPercent}%` : undefined;
}

interface ReversePromptFormProps {
  wideMode?: boolean;
  disabled?: boolean;
  onConfigureApiKey?: () => void;
}

export function ReversePromptForm({ wideMode = false, disabled = false, onConfigureApiKey }: ReversePromptFormProps) {
  const [model, setModel] = useState<ReversePromptModelId>(getDefaultReversePromptModelId());
  const [mode, setMode] = useState<ReversePromptMode>(DEFAULT_REVERSE_MODE);
  const [settingsReady, setSettingsReady] = useState(false);

  const [pendingFile, setPendingFile] = useState<UploadedFile | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [currentResult, setCurrentResult] = useState<ReverseResult | null>(null);
  const [previousResult, setPreviousResult] = useState<ReverseResult | null>(null);
  const [previousExpanded, setPreviousExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<'current' | 'previous' | null>(null);

  const [missingApiKeyDialogOpen, setMissingApiKeyDialogOpen] = useState(false);
  const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
  const [modePopoverOpen, setModePopoverOpen] = useState(false);

  const streamHandleRef = useRef<StreamReverseHandle | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // 挂载后恢复缓存设置 + 从 IndexedDB 恢复反推结果
  useEffect(() => {
    let cancelled = false;

    queueMicrotask(() => {
      if (cancelled) return;

      const saved = loadJsonFromStorage<ReverseSettings>(REVERSE_SETTINGS_KEY);
      const fallbackModel = getDefaultReversePromptModelId();
      if (saved.model && isReversePromptModel(saved.model) && getConfiguredTextModel(saved.model)) {
        setModel(saved.model);
      } else if (fallbackModel) {
        setModel(fallbackModel);
      }
      if (saved.mode && isReversePromptMode(saved.mode)) {
        setMode(saved.mode);
      }
      setSettingsReady(true);

    // 恢复反推结果
    void loadReverseResults().then((stored) => {
      if (stored.current) {
        setCurrentResult({
          text: stored.current.text,
          model: stored.current.model as ReversePromptModelId,
          mode: stored.current.mode as ReversePromptMode,
          finished: true,
          aborted: stored.current.aborted,
        });
      }
      if (stored.previous) {
        setPreviousResult({
          text: stored.previous.text,
          model: stored.previous.model as ReversePromptModelId,
          mode: stored.previous.mode as ReversePromptMode,
          finished: true,
          aborted: stored.previous.aborted,
        });
      }
      if (stored.draft?.file) {
        setPendingFile(stored.draft.file);
      }
    });
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // 设置变化时持久化
  useEffect(() => {
    if (!settingsReady) return;
    saveJsonToStorage(REVERSE_SETTINGS_KEY, { model, mode });
  }, [model, mode, settingsReady]);

  // 卸载时取消正在进行的流
  useEffect(() => {
    return () => {
      streamHandleRef.current?.abort();
      streamHandleRef.current = null;
    };
  }, []);

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (arr.length === 0) {
      setUploadError('请选择图像文件');
      return;
    }
    // 只取第一张
    const file = arr[0];

    setUploading(true);
    setUploadError(null);
    try {
      const optimized = await prepareUploadImage(file);
      if (optimized.processedSize > MAX_UPLOAD_SIZE_BYTES) {
        setUploadError(`文件过大: ${file.name}，压缩后仍超过 10MB`);
        return;
      }
      const nextFile = {
        id: optimized.id,
        name: optimized.name,
        preview: optimized.preview,
        dataUrl: optimized.dataUrl,
        mimeType: optimized.mimeType,
        badge: getOptimizationBadge(optimized.originalSize, optimized.processedSize, optimized.cacheHit),
      };
      setPendingFile(nextFile);
      void saveReverseDraft(nextFile);
    } catch {
      setUploadError('文件读取失败');
    } finally {
      setUploading(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!disabled && e.dataTransfer.files.length > 0) {
      void processFiles(e.dataTransfer.files);
    }
  }, [disabled, processFiles]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      void processFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleRemoveFile = useCallback(() => {
    setPendingFile(null);
    void clearReverseDraft();
  }, []);

  // 粘贴图片支持
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (disabled || uploading || streaming) return;
      const target = e.target as HTMLElement;
      // 只处理粘贴目标在本表单容器内的事件，避免与其他全局粘贴处理器冲突
      if (!formRef.current?.contains(target)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        e.preventDefault();
        void processFiles(imageFiles);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [disabled, uploading, streaming, processFiles]);

  const handleSubmit = () => {
    if (!pendingFile || streaming || disabled) return;
    const configuredModel = getConfiguredTextModel(model);
    if (!configuredModel?.apiKey || !configuredModel.baseUrl || !configuredModel.modelId) {
      setMissingApiKeyDialogOpen(true);
      return;
    }

    // 把上一次结果挪到「上次结果」槽
    if (currentResult && currentResult.text.length > 0) {
      setPreviousResult(currentResult);
      setPreviousExpanded(false);
      // 持久化上次结果
      void saveReverseResult({
        slot: 'previous',
        text: currentResult.text,
        model: currentResult.model,
        mode: currentResult.mode,
        aborted: currentResult.aborted,
        timestamp: Date.now(),
      });
    }
    setCurrentResult({ text: '', model, mode, finished: false });
    setError(null);
    setStreaming(true);

    // 中断正在进行的旧请求（如果有）
    streamHandleRef.current?.abort();

    const handle = streamReversePrompt(
      {
        apiKey: configuredModel.apiKey,
        model: configuredModel.id,
        mode,
        imageDataUrl: pendingFile.dataUrl,
        mimeType: pendingFile.mimeType,
      },
      {
        onDelta: (token) => {
          setCurrentResult(prev => prev ? { ...prev, text: prev.text + token } : prev);
        },
        onDone: (fullText) => {
          setCurrentResult(prev => prev ? {
            ...prev,
            text: fullText.length > prev.text.length ? fullText : prev.text,
            finished: true,
          } : prev);
          setStreaming(false);
          streamHandleRef.current = null;
          // 持久化当前结果
          if (fullText.length > 0) {
            void saveReverseResult({
              slot: 'current',
              text: fullText,
              model,
              mode,
              aborted: false,
              timestamp: Date.now(),
            });
          }
        },
        onError: (err) => {
          setError(err.message || '反推失败，请稍后重试');
          setCurrentResult(prev => {
            if (prev && prev.text.length > 0) {
              // 失败时如果有内容也持久化
              void saveReverseResult({
                slot: 'current',
                text: prev.text,
                model,
                mode,
                aborted: false,
                timestamp: Date.now(),
              });
            }
            return prev ? { ...prev, finished: true } : prev;
          });
          setStreaming(false);
          streamHandleRef.current = null;
        },
      },
      configuredModel.baseUrl
    );
    streamHandleRef.current = handle;
  };

  const handleAbort = () => {
    streamHandleRef.current?.abort();
    streamHandleRef.current = null;
    setStreaming(false);
    setCurrentResult(prev => {
      if (prev && prev.text.length > 0) {
        // 停止时如果有内容也持久化
        void saveReverseResult({
          slot: 'current',
          text: prev.text,
          model: prev.model,
          mode: prev.mode,
          aborted: true,
          timestamp: Date.now(),
        });
      }
      return prev ? { ...prev, finished: true, aborted: true } : prev;
    });
  };

  const handleCopy = async (text: string, slot: 'current' | 'previous') => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyState(slot);
      setTimeout(() => setCopyState(prev => (prev === slot ? null : prev)), 1500);
    } catch {
      setError('复制失败，请手动选择文字复制');
    }
  };

  const handleClearDraft = () => {
    setPendingFile(null);
    setUploadError(null);
    void clearReverseDraft();
  };

  const canSubmit = !!pendingFile && !disabled && !uploading && !streaming;
  const reverseModelOptions = getReversePromptModelOptionsList();
  const modelLabel = getReverseModelOption(model).label;
  const modeOption = getReverseModeOption(mode);

  return (
    <div
      ref={formRef}
      className={cn(
        'space-y-4',
        wideMode && !disabled && 'xl:grid xl:grid-cols-[minmax(400px,0.8fr)_minmax(0,1.2fr)] xl:gap-5 xl:space-y-0 xl:items-start'
      )}
    >
      <div className={cn('space-y-4', wideMode && !disabled && 'xl:sticky xl:top-4')}>
      <div className="bg-muted/50 border border-border rounded-xl shadow-md">
        {disabled ? (
          <div className="flex min-h-40 flex-col items-center justify-center gap-4 px-4 py-8 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Info className="h-5 w-5" />
            </div>
            <div className="max-w-md">
              <p className="text-base font-medium text-foreground">需要先配置令牌</p>
              <p className="mt-2 text-sm text-muted-foreground">
                请先在设置中配置 API Key，配置完成后即可使用反推提示词功能。
              </p>
            </div>
            <Button onClick={() => setMissingApiKeyDialogOpen(true)}>配置</Button>
          </div>
        ) : (
          <>
            {/* 上传区 */}
            <div className="p-4">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={cn(
                  'relative border-2 border-dashed rounded-xl px-6 py-10 text-center transition-all overflow-hidden',
                  isDragOver
                    ? 'border-primary bg-primary/20'
                    : 'bg-primary/5 border-primary/30 hover:bg-primary/10 hover:border-primary/50 cursor-pointer'
                )}
              >
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  disabled={uploading || streaming}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed overflow-hidden"
                  style={{ fontSize: 0 }}
                />
                <CloudUpload className={cn('w-6 h-6 mx-auto mb-1', isDragOver ? 'text-primary' : 'text-muted-foreground')} />
                <p className="text-sm font-medium">
                  {uploading ? '读取中...' : isDragOver ? '将图像拖放到这里' : '拖放参考图到此处'}
                </p>
                <p className="text-xs text-muted-foreground">点击选择 · 拖放 · Ctrl+V 粘贴 · 仅支持单张</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {pendingFile ? '已上传 1 / 1 张（再次选择会替换）' : '0 / 1 张'}
                </p>
              </div>
            </div>

            {pendingFile && (
              <div className="px-4 pb-2">
                <AttachmentChips
                  files={[pendingFile]}
                  onRemove={handleRemoveFile}
                  sourceKind="reverse-prompt"
                  sourceLabel="反推提示词上传图"
                  showDownload={false}
                  showCopy
                  showUseAsReference={false}
                />
              </div>
            )}

            {/* 控件栏 */}
            <div className="flex flex-wrap items-center gap-1.5 px-4 pb-3 pt-1">
              {/* 模型选择 */}
              <Popover open={modelPopoverOpen} onOpenChange={setModelPopoverOpen}>
                <PopoverTrigger
                  className={cn(buttonVariants({ variant: 'outline', size: 'xs' }), 'gap-1')}
                  title="模型选择"
                >
                  <Sparkles className="h-3 w-3" />
                  <span className="shrink-0 truncate text-[11px]">{modelLabel}</span>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="start">
                  {reverseModelOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setModel(option.value);
                        setTimeout(() => setModelPopoverOpen(false), 0);
                      }}
                      className={cn(
                        'w-full text-left px-2.5 py-1.5 rounded-md text-sm hover:bg-muted',
                        model === option.value && 'bg-muted font-medium'
                      )}
                    >
                      <div>{option.label}</div>
                      <div className={cn('text-[11px] mt-0.5', model === option.value ? 'opacity-90' : 'opacity-70')}>
                        {option.description}
                      </div>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* 模式选择 */}
              <Popover open={modePopoverOpen} onOpenChange={setModePopoverOpen}>
                <PopoverTrigger
                  className={cn(buttonVariants({ variant: 'outline', size: 'xs' }), 'gap-1')}
                  title="反推模式"
                >
                  <ScanSearch className="h-3 w-3" />
                  <span className="shrink-0 truncate text-[11px]">{modeOption.label}</span>
                </PopoverTrigger>
                <PopoverContent className="w-48 p-1" align="start">
                  {REVERSE_PROMPT_MODE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setMode(option.value);
                        setTimeout(() => setModePopoverOpen(false), 0);
                      }}
                      className={cn(
                        'w-full text-left px-2.5 py-1.5 rounded-md text-sm hover:bg-muted',
                        mode === option.value && 'bg-muted font-medium'
                      )}
                    >
                      <div>{option.label}</div>
                      <div className={cn('text-[11px] mt-0.5', mode === option.value ? 'opacity-90' : 'opacity-70')}>
                        {option.description}
                      </div>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              <div className="ml-auto flex w-full justify-end gap-2 sm:w-auto">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleClearDraft}
                  disabled={disabled || (!pendingFile && !uploadError)}
                  title="清空已上传图片"
                >
                  <X className="w-5 h-5" />
                </Button>
                {streaming ? (
                  <Button
                    onClick={handleAbort}
                    size="icon"
                    variant="destructive"
                    title="停止反推"
                  >
                    <Square className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    size="icon"
                    title="开始反推提示词"
                  >
                    {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowUp className="w-5 h-5" />}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div
        className={cn(
          'space-y-4',
          wideMode && !disabled && 'xl:max-h-[calc(100vh-7rem)] xl:overflow-y-auto xl:pr-1'
        )}
      >
      {wideMode && !disabled && !currentResult && !previousResult && (
        <div className="flex min-h-60 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
          <ScanSearch className="h-7 w-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">反推结果会显示在这里</p>
        </div>
      )}

      {/* 当前结果 */}
      {currentResult && (
        <ResultPanel
          title="反推结果"
          result={currentResult}
          streaming={streaming}
          copied={copyState === 'current'}
          onCopy={() => handleCopy(currentResult.text, 'current')}
          onAbort={streaming ? handleAbort : undefined}
        />
      )}

      {/* 上次结果（折叠） */}
      {previousResult && (
        <div className="rounded-xl border border-border bg-card/60 shadow-sm">
          <button
            type="button"
            onClick={() => setPreviousExpanded(p => !p)}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              {previousExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <span>上次结果</span>
              <span className="text-xs text-muted-foreground">
                · {getReverseModelOption(previousResult.model).label} · {getReverseModeOption(previousResult.mode).label}
              </span>
            </span>
          </button>
          {previousExpanded && (
            <div className="border-t border-border px-4 pb-4 pt-3">
              <ResultPanel
                title="上次结果"
                result={previousResult}
                streaming={false}
                inline
                copied={copyState === 'previous'}
                onCopy={() => handleCopy(previousResult.text, 'previous')}
              />
            </div>
          )}
        </div>
      )}
      </div>

      <MissingApiKeyDialog
        open={missingApiKeyDialogOpen}
        onOpenChange={setMissingApiKeyDialogOpen}
        onConfigure={() => onConfigureApiKey?.()}
      />
    </div>
  );
}

interface ResultPanelProps {
  title: string;
  result: ReverseResult;
  streaming: boolean;
  copied: boolean;
  inline?: boolean;
  onCopy: () => void;
  onAbort?: () => void;
}

function ResultPanel({ title, result, streaming, copied, inline, onCopy, onAbort }: ResultPanelProps) {
  const modelLabel = getReverseModelOption(result.model).label;
  const modeLabel = getReverseModeOption(result.mode).label;
  const isEmpty = result.text.length === 0;
  const showWaitingHint = streaming && isEmpty;

  return (
    <div className={cn(!inline && 'rounded-xl border border-border bg-card/60 p-4 shadow-sm')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {!inline && <span className="font-medium text-foreground">{title}</span>}
          <span className="rounded-full bg-muted px-2 py-0.5">{modelLabel}</span>
          <span className="rounded-full bg-muted px-2 py-0.5">{modeLabel}</span>
          {streaming && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>生成中</span>
            </span>
          )}
          {result.aborted && (
            <span className="rounded-full bg-warning/10 px-2 py-0.5 text-warning">已停止</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onAbort && (
            <Button variant="outline" size="xs" className="gap-1" onClick={onAbort} title="停止生成">
              <Square className="w-3 h-3" />
              <span>停止</span>
            </Button>
          )}
          <Button
            variant="ghost"
            size="xs"
            className="gap-1"
            onClick={onCopy}
            disabled={isEmpty}
            title="复制全文"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? '已复制' : '复制'}</span>
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'whitespace-pre-wrap break-words rounded-md bg-muted/40 px-3 py-3 text-sm leading-relaxed',
          showWaitingHint && 'text-muted-foreground italic'
        )}
      >
        {showWaitingHint ? '正在思考与生成中，请稍候...' : (result.text || '（无内容）')}
        {streaming && !isEmpty && (
          <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-primary/70" />
        )}
      </div>
    </div>
  );
}
