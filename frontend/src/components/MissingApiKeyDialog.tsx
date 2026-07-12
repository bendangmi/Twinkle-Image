'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface MissingApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigure: () => void;
}

export function MissingApiKeyDialog({ open, onOpenChange, onConfigure }: MissingApiKeyDialogProps) {
  const handleConfigure = () => {
    onOpenChange(false);
    onConfigure();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>请先配置 API 密钥</DialogTitle>
          <DialogDescription>
            需要先配置 API Key，配置完成后即可生成或转换图片。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={handleConfigure}>
            配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
