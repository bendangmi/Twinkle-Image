'use client';

import { useEffect, useMemo, useState } from 'react';
import { Maximize } from 'lucide-react';
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
import { normalizeCustomImageSize } from '@/lib/model-capabilities';

interface CustomSizeDialogProps {
  open: boolean;
  value?: string;
  maxSide: number;
  onOpenChange: (open: boolean) => void;
  onApply: (size: string) => void;
}

function parseSize(size?: string): { width: string; height: string } {
  const match = String(size || '').match(/^\s*(\d+)\s*[xX×]\s*(\d+)\s*$/);
  return {
    width: match?.[1] || '1024',
    height: match?.[2] || '1024',
  };
}

export function CustomSizeDialog({ open, value, maxSide, onOpenChange, onApply }: CustomSizeDialogProps) {
  const parsed = parseSize(value);
  const [width, setWidth] = useState(parsed.width);
  const [height, setHeight] = useState(parsed.height);

  useEffect(() => {
    if (!open) return;
    const next = parseSize(value);
    queueMicrotask(() => {
      setWidth(next.width);
      setHeight(next.height);
    });
  }, [open, value]);

  const normalizedSize = useMemo(
    () => normalizeCustomImageSize(`${width}x${height}`, maxSide),
    [width, height, maxSide]
  );

  const handleApply = () => {
    if (!normalizedSize) return;
    onApply(normalizedSize);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>自定义尺寸</DialogTitle>
          <DialogDescription>
            输入图片宽度和高度，单位为 px。系统会严格按输入尺寸提交给模型，最大边长 {maxSide}px。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
            <label className="space-y-1.5">
              <span className="text-xs text-muted-foreground">宽度</span>
              <Input
                type="number"
                min={1}
                max={maxSide}
                step={1}
                value={width}
                onChange={event => setWidth(event.target.value)}
              />
            </label>
            <span className="pb-2 text-sm text-muted-foreground">×</span>
            <label className="space-y-1.5">
              <span className="text-xs text-muted-foreground">高度</span>
              <Input
                type="number"
                min={1}
                max={maxSide}
                step={1}
                value={height}
                onChange={event => setHeight(event.target.value)}
              />
            </label>
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2">
            <Maximize className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">将使用</div>
              <div className="font-mono text-sm font-medium">
                {normalizedSize ? `${normalizedSize.replace('x', ' × ')} px` : '尺寸无效'}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleApply} disabled={!normalizedSize}>
            确定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
