'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader2,
  RotateCcw,
  RotateCw,
  Eye,
  EyeOff,
  Film,
  X,
  Layers,
  Grid3x3,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  ChevronsDown,
  Pipette,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ConfirmDialog } from '@/components/workspace/dialogs/ConfirmDialog';
import { isImeComposing } from '@/lib/keyboard';
import { cn } from '@/lib/utils';
import type { GridCell } from '@/lib/gif-encoder';

interface FrameTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number; // degrees, positive = clockwise
}

interface GifFrameTunerProps {
  cells: GridCell[];
  cellWidth: number;
  cellHeight: number;
  onGenerate: (frames: ImageData[]) => void;
  onClose: () => void;
}

const IDENTITY: FrameTransform = { offsetX: 0, offsetY: 0, scale: 1, rotation: 0 };
const BG_PRESETS = ['#000000', '#ffffff'];
const MOBILE_HINT_STORAGE_KEY = 'nova-gif-tuner-mobile-hint-hidden';

function isEdited(t: FrameTransform): boolean {
  return t.offsetX !== 0 || t.offsetY !== 0 || t.scale !== 1 || t.rotation !== 0;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('帧图加载失败'));
    img.src = src;
  });
}

export function GifFrameTuner({ cells, cellWidth, cellHeight, onGenerate, onClose }: GifFrameTunerProps) {
  const [images, setImages] = useState<HTMLImageElement[]>([]);
  const [transforms, setTransforms] = useState<FrameTransform[]>(() => cells.map(() => ({ ...IDENTITY })));
  const [activeIndex, setActiveIndex] = useState(0);
  const [showOnion, setShowOnion] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [bgColor, setBgColor] = useState('#000000');
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [viewSize, setViewSize] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [rotatingHandle, setRotatingHandle] = useState(false);
  const [samplingColor, setSamplingColor] = useState(false);
  const [mobileHintOpen, setMobileHintOpen] = useState(false);
  const [hideMobileHintNextTime, setHideMobileHintNextTime] = useState(false);

  const controlRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ active: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });
  const touchRef = useRef({ initialDistance: 0, initialScale: 1, single: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });
  const rotateRef = useRef({ active: false, centerX: 0, centerY: 0, startAngle: 0, baseRotation: 0 });

  const anyEdited = useMemo(() => transforms.some(isEdited), [transforms]);

  const requestClose = useCallback(() => {
    if (anyEdited) setCloseConfirmOpen(true);
    else onClose();
  }, [anyEdited, onClose]);

  // 画布像素 -> 单元格像素的换算系数（可视区边长对应一个 cellWidth）
  const pxToCell = viewSize > 0 ? cellWidth / viewSize : 1;

  const commitBgColor = useCallback((color: string) => {
    setBgColor(color);
    setSamplingColor(false);
  }, []);

  const updateActive = useCallback((patch: Partial<FrameTransform>) => {
    setTransforms(prev => prev.map((t, i) => (i === activeIndex ? { ...t, ...patch } : t)));
  }, [activeIndex]);

  const nudge = useCallback((dxCell: number, dyCell: number) => {
    setTransforms(prev => prev.map((t, i) => (
      i === activeIndex ? { ...t, offsetX: t.offsetX + dxCell, offsetY: t.offsetY + dyCell } : t
    )));
  }, [activeIndex]);

  const resetActive = useCallback(() => {
    setTransforms(prev => prev.map((t, i) => (i === activeIndex ? { ...IDENTITY } : t)));
  }, [activeIndex]);

  const resetAll = useCallback(() => {
    setTransforms(cells.map(() => ({ ...IDENTITY })));
  }, [cells]);

  useEffect(() => {
    if (!window.matchMedia('(max-width: 767px)').matches) return;
    try {
      if (localStorage.getItem(MOBILE_HINT_STORAGE_KEY) === '1') return;
    } catch {
      // Ignore unavailable storage.
    }
    const timer = window.setTimeout(() => setMobileHintOpen(true), 250);
    return () => window.clearTimeout(timer);
  }, []);

  const dismissMobileHint = useCallback(() => {
    if (hideMobileHintNextTime) {
      try {
        localStorage.setItem(MOBILE_HINT_STORAGE_KEY, '1');
      } catch {
        // Ignore unavailable storage.
      }
    }
    setMobileHintOpen(false);
  }, [hideMobileHintNextTime]);

  // 全屏微调期间锁定主页面滚动，避免背景滚动条误导用户
  useEffect(() => {
    const scrollY = window.scrollY;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    return () => {
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('position');
      document.body.style.removeProperty('top');
      document.body.style.removeProperty('width');
      window.scrollTo(0, scrollY);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all(cells.map(c => loadImage(c.dataUrl)))
      .then(imgs => { if (!cancelled) setImages(imgs); })
      .catch(() => { /* 单元格本来就是本地 dataURL，几乎不会失败 */ });
    return () => { cancelled = true; };
  }, [cells]);

  useEffect(() => {
    const measure = () => {
      const el = controlRef.current;
      if (!el) return;
      setViewSize(Math.floor(Math.min(el.clientWidth, el.clientHeight) * 0.62));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [images.length]);

  // 方向键微调位置；Shift+方向键切换帧；Esc 关闭
  useEffect(() => {
    const step = coarseStep(cellWidth);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { requestClose(); return; }
      const isArrow = e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      if (!isArrow) return;
      e.preventDefault();
      if (e.shiftKey) {
        if (e.key === 'ArrowRight') setActiveIndex(i => Math.min(i + 1, cells.length - 1));
        else if (e.key === 'ArrowLeft') setActiveIndex(i => Math.max(i - 1, 0));
        return;
      }
      // Alt+方向键 = 旋转微调（左-1°，右+1°）
      if (e.altKey) {
        if (e.key === 'ArrowLeft') updateActive({ rotation: clampRotation((transforms[activeIndex]?.rotation ?? 0) - 1) });
        if (e.key === 'ArrowRight') updateActive({ rotation: clampRotation((transforms[activeIndex]?.rotation ?? 0) + 1) });
        return;
      }
      if (e.key === 'ArrowUp') nudge(0, -step);
      else if (e.key === 'ArrowDown') nudge(0, step);
      else if (e.key === 'ArrowLeft') nudge(-step, 0);
      else if (e.key === 'ArrowRight') nudge(step, 0);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cells.length, cellWidth, requestClose, nudge, transforms, activeIndex, updateActive]);

  // 滚轮缩放：用原生非被动监听，避免 preventDefault 失效导致主页面滚动
  useEffect(() => {
    const el = controlRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setTransforms(prev => prev.map((t, i) => (
        i === activeIndex ? { ...t, scale: clampScale(t.scale + (e.deltaY < 0 ? 0.05 : -0.05)) } : t
      )));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [activeIndex]);

  // 拖动期间在 window 上兜底，鼠标移出控制区仍可控、松开即停
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current.active) return;
      setTransforms(prev => prev.map((t, i) => (
        i === activeIndex
          ? {
              ...t,
              offsetX: dragRef.current.baseX + (e.clientX - dragRef.current.startX) * pxToCell,
              offsetY: dragRef.current.baseY + (e.clientY - dragRef.current.startY) * pxToCell,
            }
          : t
      )));
    };
    const onUp = () => { dragRef.current.active = false; setDragging(false); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, activeIndex, pxToCell]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (samplingColor) return;
    const t = transforms[activeIndex];
    dragRef.current = { active: true, startX: e.clientX, startY: e.clientY, baseX: t.offsetX, baseY: t.offsetY };
    setDragging(true);
  }, [samplingColor, transforms, activeIndex]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (samplingColor) return;
    const t = transforms[activeIndex];
    if (e.touches.length === 2) {
      touchRef.current.initialDistance = distance(e.touches[0], e.touches[1]);
      touchRef.current.initialScale = t.scale;
      touchRef.current.single = false;
    } else if (e.touches.length === 1) {
      touchRef.current.single = true;
      touchRef.current.startX = e.touches[0].clientX;
      touchRef.current.startY = e.touches[0].clientY;
      touchRef.current.baseX = t.offsetX;
      touchRef.current.baseY = t.offsetY;
    }
  }, [samplingColor, transforms, activeIndex]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (samplingColor) return;
    if (e.touches.length === 2) {
      const ratio = distance(e.touches[0], e.touches[1]) / (touchRef.current.initialDistance || 1);
      updateActive({ scale: clampScale(touchRef.current.initialScale * ratio) });
    } else if (e.touches.length === 1 && touchRef.current.single) {
      updateActive({
        offsetX: touchRef.current.baseX + (e.touches[0].clientX - touchRef.current.startX) * pxToCell,
        offsetY: touchRef.current.baseY + (e.touches[0].clientY - touchRef.current.startY) * pxToCell,
      });
    }
  }, [samplingColor, updateActive, pxToCell]);

  const handleTouchEnd = useCallback(() => { touchRef.current.single = false; }, []);

  // ── 旋转把手：按住拖动旋转当前帧 ──
  useEffect(() => {
    if (!rotatingHandle) return;
    const onMove = (e: MouseEvent) => {
      if (!rotateRef.current.active) return;
      const { centerX, centerY, startAngle, baseRotation } = rotateRef.current;
      const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
      const delta = angle - startAngle;
      updateActive({ rotation: clampRotation(baseRotation + delta) });
    };
    const onUp = () => { rotateRef.current.active = false; setRotatingHandle(false); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [rotatingHandle, updateActive]);

  const handleRotateMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // 避免触发平移拖动
    const rect = controlRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * (180 / Math.PI);
    const t = transforms[activeIndex];
    rotateRef.current = { active: true, centerX, centerY, startAngle, baseRotation: t.rotation };
    setRotatingHandle(true);
  }, [transforms, activeIndex]);

  const handleRotateTouchStart = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
    const rect = controlRef.current?.getBoundingClientRect();
    if (!rect) return;
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const touch = e.touches[0];
    const startAngle = Math.atan2(touch.clientY - centerY, touch.clientX - centerX) * (180 / Math.PI);
    const t = transforms[activeIndex];
    rotateRef.current = { active: true, centerX, centerY, startAngle, baseRotation: t.rotation };
    setRotatingHandle(true);
  }, [transforms, activeIndex]);

  // 旋转触摸拖动
  useEffect(() => {
    if (!rotatingHandle) return;
    const onTouchMove = (e: TouchEvent) => {
      if (!rotateRef.current.active || e.touches.length < 1) return;
      e.preventDefault();
      const { centerX, centerY, startAngle, baseRotation } = rotateRef.current;
      const touch = e.touches[0];
      const angle = Math.atan2(touch.clientY - centerY, touch.clientX - centerX) * (180 / Math.PI);
      const delta = angle - startAngle;
      updateActive({ rotation: clampRotation(baseRotation + delta) });
    };
    const onTouchEnd = () => { rotateRef.current.active = false; setRotatingHandle(false); };
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
    window.addEventListener('touchcancel', onTouchEnd);
    return () => {
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [rotatingHandle, updateActive]);

  const composeFrames = useCallback((): ImageData[] => {
    const canvas = document.createElement('canvas');
    canvas.width = cellWidth;
    canvas.height = cellHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('当前浏览器不支持 Canvas 2D');
    return images.map((img, i) => {
      const t = transforms[i] || IDENTITY;
      ctx.clearRect(0, 0, cellWidth, cellHeight);
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, cellWidth, cellHeight);
      ctx.save();
      // 旋转：以画布中心为原点
      ctx.translate(cellWidth / 2 + t.offsetX, cellHeight / 2 + t.offsetY);
      ctx.rotate((t.rotation * Math.PI) / 180);
      const drawW = cellWidth * t.scale;
      const drawH = cellHeight * t.scale;
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
      return ctx.getImageData(0, 0, cellWidth, cellHeight);
    });
  }, [images, transforms, cellWidth, cellHeight, bgColor]);

  const handleGenerate = useCallback(() => {
    if (images.length === 0) return;
    onGenerate(composeFrames());
  }, [images.length, composeFrames, onGenerate]);

  const loading = images.length === 0;
  const activeTransform = transforms[activeIndex] || IDENTITY;
  const onionTransform = activeIndex > 0 ? (transforms[activeIndex - 1] || IDENTITY) : null;
  const onionImage = activeIndex > 0 ? images[activeIndex - 1] : null;

  const sampleActiveImageColor = useCallback((clientX: number, clientY: number) => {
    const el = controlRef.current;
    const img = images[activeIndex];
    if (!el || !img || viewSize <= 0) return false;

    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2 + activeTransform.offsetX / pxToCell;
    const centerY = rect.top + rect.height / 2 + activeTransform.offsetY / pxToCell;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const angle = activeTransform.rotation * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const localX = (dx * cos + dy * sin) / activeTransform.scale;
    const localY = (-dx * sin + dy * cos) / activeTransform.scale;
    const u = localX / viewSize + 0.5;
    const v = localY / viewSize + 0.5;
    if (u < 0 || u > 1 || v < 0 || v > 1) return false;

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return false;

    const sx = Math.max(0, Math.min(img.naturalWidth - 1, Math.floor(u * img.naturalWidth)));
    const sy = Math.max(0, Math.min(img.naturalHeight - 1, Math.floor(v * img.naturalHeight)));
    ctx.drawImage(img, sx, sy, 1, 1, 0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return false;

    commitBgColor(rgbToHex({ r, g, b }));
    return true;
  }, [activeIndex, activeTransform, commitBgColor, images, pxToCell, viewSize]);

  const handleControlPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!samplingColor) return;
    e.preventDefault();
    e.stopPropagation();
    sampleActiveImageColor(e.clientX, e.clientY);
  }, [sampleActiveImageColor, samplingColor]);

  const layerStyle = (t: FrameTransform): React.CSSProperties => ({
    width: viewSize,
    height: viewSize,
    transform: `translate(-50%, -50%) translate(${t.offsetX / pxToCell}px, ${t.offsetY / pxToCell}px) rotate(${t.rotation}deg) scale(${t.scale})`,
  });

  return (
    <div className="fixed inset-0 z-[9999] flex select-none flex-col bg-background/95 backdrop-blur-sm">
      {/* 顶部工具栏 */}
      <div className="scrollbar-hide flex h-12 shrink-0 touch-pan-x select-none items-center gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain border-b border-border bg-background/95 px-3 sm:px-4">
        <div className="flex shrink-0 items-center gap-2 text-sm font-medium text-foreground">
          <Layers className="h-4 w-4 text-primary" />
          <span>逐帧微调</span>
          <span className="text-xs font-normal text-muted-foreground">
            第 {activeIndex + 1} / {cells.length} 帧
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* 背景色 */}
          <div className="mr-1 flex items-center gap-1">
            {BG_PRESETS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => commitBgColor(c)}
                className={cn(
                  'h-6 w-6 rounded-full border transition-all',
                  bgColor.toLowerCase() === c ? 'ring-2 ring-primary ring-offset-1 ring-offset-background' : 'border-border',
                )}
                style={{ background: c }}
                title={c === '#000000' ? '黑色背景' : '白色背景'}
              />
            ))}
            <div className="mx-0.5 h-4 w-px bg-border" />
            <ColorPicker
              value={bgColor}
              onChange={commitBgColor}
              onPickFromImage={() => setSamplingColor(value => !value)}
              pickingFromImage={samplingColor}
            />
          </div>
          <div className="mx-1 h-5 w-px bg-border" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowGrid(v => !v)}
            className={cn('gap-1', showGrid ? 'text-primary' : 'text-muted-foreground')}
            title="显示/隐藏对齐网格"
          >
            <Grid3x3 className="h-4 w-4" />
            <span className="hidden sm:inline">网格</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowOnion(v => !v)}
            className={cn('gap-1', showOnion ? 'text-primary' : 'text-muted-foreground')}
            title="叠加显示上一帧（半透明）以便对齐"
          >
            {showOnion ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            <span className="hidden sm:inline">辅助对齐</span>
          </Button>
          <Button variant="ghost" size="sm" onClick={resetAll} className="gap-1" title="重置所有帧">
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">全部重置</span>
          </Button>
          <Button onClick={handleGenerate} disabled={loading} className="gap-1">
            <Film className="h-4 w-4" />
            生成
          </Button>
          <Button variant="ghost" size="icon" onClick={requestClose} title="关闭">
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* 编辑区 */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative flex min-h-0 flex-1 items-center justify-center p-3 pb-14 sm:p-4 sm:pb-16">
          {/* 控制区：占满、接收所有指针事件、铺网格背景 */}
          <div
            ref={controlRef}
            className="relative h-full w-full overflow-hidden rounded-lg ring-1 ring-border"
            onMouseDown={handleMouseDown}
            onPointerUp={handleControlPointerUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{ background: bgColor, cursor: samplingColor ? 'crosshair' : (dragging ? 'grabbing' : 'grab'), touchAction: 'none' }}
          >
            {samplingColor && (
              <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-md border border-primary/30 bg-background/90 px-3 py-1.5 text-xs text-foreground shadow-sm">
                点击当前帧取背景色
              </div>
            )}

            {/* 网格背景 */}
            {showGrid && (
              <div
                className="pointer-events-none absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    'linear-gradient(to right, rgba(128,128,128,0.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(128,128,128,0.35) 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              />
            )}

            {loading && (
              <div className="absolute inset-0 z-20 flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}

            {/* 主帧（底层） */}
            {images[activeIndex] && (
              <img
                src={images[activeIndex].src}
                alt={`帧 ${activeIndex + 1}`}
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 object-cover"
                style={layerStyle(activeTransform)}
              />
            )}

            {/* 洋葱皮：仅上一帧，半透明置于顶层方便对齐；首帧不显示 */}
            {showOnion && onionImage && onionTransform && (
              <img
                src={onionImage.src}
                alt=""
                draggable={false}
                className="pointer-events-none absolute left-1/2 top-1/2 object-cover opacity-50"
                style={layerStyle(onionTransform)}
              />
            )}

            {/* 可视区框：导出范围参考，居中正方形 */}
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm ring-2 ring-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]"
              style={{ width: viewSize, height: viewSize }}
            >
              <span className="absolute -top-6 left-0 rounded bg-primary/80 px-1.5 py-0.5 text-[10px] font-medium text-primary-foreground">
                导出范围
              </span>
            </div>

            {/* 旋转拖拽把手：在图片右侧，按住拖动旋转 */}
            <div
              className="absolute left-1/2 top-1/2 z-10"
              style={{ transform: `translate(${viewSize / 2 + 16}px, -50%)` }}
            >
              <button
                type="button"
                onMouseDown={handleRotateMouseDown}
                onTouchStart={handleRotateTouchStart}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full border-2 border-primary/60 bg-background/90 shadow-lg transition-all',
                  rotatingHandle ? 'scale-110 border-primary bg-primary/10' : 'hover:border-primary hover:bg-primary/5 active:scale-105',
                )}
                style={{ cursor: rotatingHandle ? 'grabbing' : 'grab', touchAction: 'none' }}
                title="按住拖动旋转（Alt+←/→ 微调1°）"
              >
                <RotateCw className={cn('h-5 w-5 text-primary', rotatingHandle && 'animate-pulse')} />
              </button>
              {/* 旋转连接线 */}
              <div className="absolute -left-4 top-1/2 h-px w-4 bg-primary/30" />
            </div>
          </div>

          {/* 主帧控制条 */}
          <div className="scrollbar-hide absolute inset-x-0 bottom-0 flex touch-pan-x items-center gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain border-t border-border bg-background/95 px-2 py-2 whitespace-nowrap [&>*]:shrink-0">
            {/* 缩放 */}
            <span className="text-xs text-muted-foreground">缩放</span>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.01}
              value={activeTransform.scale}
              onChange={e => updateActive({ scale: clampScale(parseFloat(e.target.value)) })}
              className="h-1 w-24 cursor-pointer accent-primary"
            />
            <span className="min-w-[36px] text-center text-xs tabular-nums text-muted-foreground">
              {Math.round(activeTransform.scale * 100)}%
            </span>
            <div className="h-4 w-px bg-border" />

            {/* 水平微调：4按钮（粗调+精调） */}
            <span className="text-xs text-muted-foreground">水平</span>
            <div className="flex items-center gap-0.5">
              <NudgeButton onClick={() => nudge(-coarseStep(cellWidth), 0)} title="粗调左移（←）"><ChevronsLeft className="h-3.5 w-3.5" /></NudgeButton>
              <NudgeButton onClick={() => nudge(-fineStep(), 0)} title="精调左移1px"><ArrowLeft className="h-3 w-3" /></NudgeButton>
              <NudgeButton onClick={() => nudge(fineStep(), 0)} title="精调右移1px"><ArrowRight className="h-3 w-3" /></NudgeButton>
              <NudgeButton onClick={() => nudge(coarseStep(cellWidth), 0)} title="粗调右移（→）"><ChevronsRight className="h-3.5 w-3.5" /></NudgeButton>
            </div>
            <div className="h-4 w-px bg-border" />

            {/* 垂直微调：4按钮（粗调+精调） */}
            <span className="text-xs text-muted-foreground">垂直</span>
            <div className="flex items-center gap-0.5">
              <NudgeButton onClick={() => nudge(0, -coarseStep(cellWidth))} title="粗调上移（↑）"><ChevronsUp className="h-3.5 w-3.5" /></NudgeButton>
              <NudgeButton onClick={() => nudge(0, -fineStep())} title="精调上移1px"><ArrowUp className="h-3 w-3" /></NudgeButton>
              <NudgeButton onClick={() => nudge(0, fineStep())} title="精调下移1px"><ArrowDown className="h-3 w-3" /></NudgeButton>
              <NudgeButton onClick={() => nudge(0, coarseStep(cellWidth))} title="粗调下移（↓）"><ChevronsDown className="h-3.5 w-3.5" /></NudgeButton>
            </div>
            <div className="h-4 w-px bg-border" />

            {/* 旋转角度显示与输入 */}
            <span className="text-xs text-muted-foreground">旋转</span>
            <div className="flex items-center gap-1">
              <NudgeButton onClick={() => updateActive({ rotation: clampRotation(activeTransform.rotation - 1) })} title="逆时针旋转1°（Alt+←）"><RotateCcw className="h-3.5 w-3.5" /></NudgeButton>
              <input
                type="text"
                inputMode="decimal"
                value={activeTransform.rotation.toFixed(2)}
                onChange={e => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) updateActive({ rotation: clampRotation(v) });
                }}
                onBlur={e => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) updateActive({ rotation: clampRotation(v) });
                  else updateActive({ rotation: 0 });
                }}
                onKeyDown={e => { if (e.key === 'Enter' && !isImeComposing(e)) (e.target as HTMLInputElement).blur(); }}
                className="h-6 w-14 rounded-md border border-border bg-background px-1.5 text-center text-xs tabular-nums text-foreground outline-none focus-visible:ring-1 focus-visible:ring-primary"
                title="旋转角度（精确到0.01°，可手动输入）"
              />
              <span className="text-[10px] text-muted-foreground">°</span>
              <NudgeButton onClick={() => updateActive({ rotation: clampRotation(activeTransform.rotation + 1) })} title="顺时针旋转1°（Alt+→）"><RotateCw className="h-3.5 w-3.5" /></NudgeButton>
            </div>
            <div className="h-4 w-px bg-border" />

            <button
              onClick={resetActive}
              className="flex h-7 items-center gap-1 rounded-full px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="重置当前帧"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              重置
            </button>
          </div>
        </div>

        {/* 帧缩略图条 */}
        <div className="shrink-0 overflow-x-auto border-t border-border p-2 lg:w-28 lg:overflow-y-auto lg:border-l lg:border-t-0">
          <div className="flex gap-2 lg:flex-col">
            {cells.map((cell, i) => (
              <button
                key={cell.index}
                type="button"
                onClick={() => setActiveIndex(i)}
                className={cn(
                  'relative aspect-square w-16 shrink-0 overflow-hidden rounded-md ring-2 transition-all lg:w-full',
                  i === activeIndex ? 'ring-primary' : 'ring-transparent hover:ring-border',
                )}
                title={`第 ${i + 1} 帧`}
              >
                <img src={cell.dataUrl} alt={`帧 ${i + 1}`} className="h-full w-full object-cover" draggable={false} />
                <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 text-[10px] leading-tight text-white">
                  {i + 1}
                </span>
                {isEdited(transforms[i] || IDENTITY) && (
                  <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {mobileHintOpen && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl">
            <h3 className="text-base font-semibold text-foreground">手机端操作提示</h3>
            <div className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              <p>顶部栏和底部工具栏都可以左右拖动，隐藏的按钮会在横向滑动后显示。</p>
              <p>画面中可单指拖动位置，双指缩放；需要背景色时，可在颜色面板里从当前帧取色。</p>
            </div>
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={hideMobileHintNextTime}
                onChange={event => setHideMobileHintNextTime(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              不再显示
            </label>
            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={dismissMobileHint}>
                知道了
              </Button>
            </div>
          </div>
        </div>
      )}

      {closeConfirmOpen && (
        <ConfirmDialog
          title="放弃已编辑的帧？"
          message="直接关闭将不会保存已编辑的帧位置。确定要关闭吗？"
          confirmText="放弃并关闭"
          cancelText="继续编辑"
          onConfirm={() => { setCloseConfirmOpen(false); onClose(); }}
          onCancel={() => setCloseConfirmOpen(false)}
        />
      )}
    </div>
  );
}

function NudgeButton({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

const PICKER_SWATCHES = ['#000000', '#ffffff', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

function ColorPicker({
  value,
  onChange,
  onPickFromImage,
  pickingFromImage,
}: {
  value: string;
  onChange: (hex: string) => void;
  onPickFromImage: () => void;
  pickingFromImage: boolean;
}) {
  const [open, setOpen] = useState(false);
  const svRef = useRef<HTMLDivElement>(null);
  const svDragRef = useRef(false);

  const hsv = useMemo(() => rgbToHsv(hexToRgb(value)), [value]);

  const commitHsv = useCallback((h: number, s: number, v: number) => {
    onChange(rgbToHex(hsvToRgb({ h, s, v })));
  }, [onChange]);

  const commitHex = useCallback((raw: string) => {
    const n = normalizeHex(raw);
    if (n) onChange(n);
  }, [onChange]);

  const handleSvPointer = useCallback((clientX: number, clientY: number) => {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = clamp01((clientX - rect.left) / rect.width);
    const v = clamp01(1 - (clientY - rect.top) / rect.height);
    commitHsv(hsv.h, s, v);
  }, [commitHsv, hsv.h]);

  useEffect(() => {
    if (!open) return;
    const onMove = (e: MouseEvent) => { if (svDragRef.current) handleSvPointer(e.clientX, e.clientY); };
    const onUp = () => { svDragRef.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [open, handleSvPointer]);

  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="h-6 w-6 shrink-0 rounded-full border border-border shadow-sm outline-none ring-offset-background transition-all focus-visible:ring-2 focus-visible:ring-primary"
        style={{ background: value }}
        title="自定义背景色"
      />
      <PopoverContent align="end" className="z-[10000] w-56 space-y-3">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            onPickFromImage();
          }}
          className={cn(
            'flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-border px-2 text-xs font-medium transition-colors hover:bg-muted',
            pickingFromImage && 'border-primary text-primary',
          )}
        >
          <Pipette className="h-3.5 w-3.5" />
          {pickingFromImage ? '取消从当前帧取色' : '从当前帧取色'}
        </button>

        {/* 饱和度 / 明度选择面板 */}
        <div
          ref={svRef}
          onMouseDown={e => { svDragRef.current = true; handleSvPointer(e.clientX, e.clientY); }}
          className="relative h-32 w-full cursor-crosshair rounded-md"
          style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})` }}
        >
          <span
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, background: value }}
          />
        </div>

        {/* 色相滑块 */}
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={Math.round(hsv.h)}
          onChange={e => commitHsv(parseInt(e.target.value, 10), hsv.s, hsv.v)}
          className="h-3 w-full cursor-pointer appearance-none rounded-full"
          style={{ background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)' }}
        />

        {/* HEX 输入 + 预览 */}
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 shrink-0 rounded-md border border-border" style={{ background: value }} />
          <input
            key={value}
            defaultValue={value}
            onBlur={e => commitHex(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !isImeComposing(e)) commitHex((e.target as HTMLInputElement).value); }}
            className="h-7 w-full rounded-md border border-border bg-background px-2 text-xs uppercase tabular-nums outline-none focus-visible:ring-1 focus-visible:ring-primary"
            spellCheck={false}
          />
        </div>

        {/* 预设色板 */}
        <div className="flex flex-wrap gap-1.5">
          {PICKER_SWATCHES.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              className={cn(
                'h-5 w-5 rounded-md border transition-all',
                value.toLowerCase() === c ? 'ring-2 ring-primary ring-offset-1 ring-offset-popover' : 'border-border',
              )}
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normalizeHex(input: string): string | null {
  let s = input.trim();
  if (!s.startsWith('#')) s = `#${s}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  }
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toLowerCase() : null;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = normalizeHex(hex) ?? '#000000';
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const h = (v: number) => Math.round(clamp01(v / 255) * 255).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbToHsv({ r, g, b }: { r: number; g: number; b: number }): { h: number; s: number; v: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb({ h, s, v }: { h: number; s: number; v: number }): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0, gp = 0, bp = 0;
  if (h < 60) { rp = c; gp = x; }
  else if (h < 120) { rp = x; gp = c; }
  else if (h < 180) { gp = c; bp = x; }
  else if (h < 240) { gp = x; bp = c; }
  else if (h < 300) { rp = x; bp = c; }
  else { rp = c; bp = x; }
  return {
    r: Math.round((rp + m) * 255),
    g: Math.round((gp + m) * 255),
    b: Math.round((bp + m) * 255),
  };
}

/** 粗调步长（约1%帧宽） */
function coarseStep(cellWidth: number): number {
  return Math.max(1, Math.round(cellWidth * 0.01));
}
/** 精调步长（固定1像素） */
function fineStep(): number {
  return 1;
}

function clampScale(value: number): number {
  return Math.max(0.5, Math.min(2, value));
}

/** 将旋转角度限制在 -180 ~ 180 度之间 */
function clampRotation(deg: number): number {
  let v = ((deg % 360) + 360) % 360;
  if (v > 180) v -= 360;
  return Math.round(v * 100) / 100; // 精确到小数点后两位
}

function distance(a: React.Touch, b: React.Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
