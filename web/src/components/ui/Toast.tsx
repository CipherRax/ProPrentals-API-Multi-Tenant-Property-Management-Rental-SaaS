'use client';

import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

export function Toast({
  type,
  message,
  onDismiss,
}: {
  type: ToastType;
  message: string;
  onDismiss: () => void;
}) {
  const styles: Record<ToastType, string> = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    error: 'border-red-200 bg-red-50 text-red-800',
    info: 'border-paper-200 bg-white text-paper-700',
  };
  const Icon = type === 'success' ? CheckCircle2 : type === 'error' ? AlertCircle : Info;
  return (
    <div
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-lg border px-4 py-3 shadow-panel ${styles[type]}`}
    >
      <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center">
        <div className="rounded-full bg-white/70 p-0.5">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="flex-1 text-sm font-medium">{message}</p>
      <button onClick={onDismiss} className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
