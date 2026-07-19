'use client';

import { useEffect } from 'react';
import { CheckCircle, XCircle, X, Info } from 'lucide-react';
import { createPortal } from 'react-dom';

export interface ToastData {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: (id: string) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 3000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  const Icon = toast.type === 'success' ? CheckCircle : toast.type === 'info' ? Info : XCircle;
  const borderColor =
    toast.type === 'success' ? 'border-success/35'
      : toast.type === 'info' ? 'border-processing/35'
        : 'border-destructive/20';
  const textColor =
    toast.type === 'success' ? 'text-success'
      : toast.type === 'info' ? 'text-processing'
        : 'text-destructive';

  return createPortal(
    <div
      className={`fixed bottom-4 right-4 z-[10000] flex max-w-sm items-center gap-2 rounded-lg border ${borderColor} bg-card px-4 py-3 text-sm ${textColor} shadow-[0_10px_30px_color-mix(in_srgb,var(--foreground)_12%,transparent)]`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="flex-shrink-0 opacity-60 hover:opacity-100"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>,
    document.body,
  );
}
