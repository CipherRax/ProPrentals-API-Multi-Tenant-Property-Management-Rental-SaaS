'use client';

import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

const styles: Record<
  ToastType,
  { accent: string; icon: string }
> = {
  success: { accent: 'border-l-emerald-600', icon: 'bg-emerald-50 text-emerald-600' },
  error: { accent: 'border-l-red-600', icon: 'bg-red-50 text-red-600' },
  info: { accent: 'border-l-sky-600', icon: 'bg-sky-50 text-sky-600' },
  warning: { accent: 'border-l-amber-500', icon: 'bg-amber-50 text-amber-600' },
};

export function Toast({
  type,
  message,
  onDismiss,
}: {
  type: ToastType;
  message: string;
  onDismiss: () => void;
}) {
  const s = styles[type];
  const Icon =
    type === 'success'
      ? CheckCircle2
      : type === 'error'
        ? AlertCircle
        : type === 'warning'
          ? TriangleAlert
          : Info;

  return (
    <div
      role="status"
      className={`pointer-events-auto flex w-full items-start gap-3 rounded-panel border border-paper-200 border-l-4 bg-white px-4 py-3 shadow-card ${s.accent}`}
    >
      <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${s.icon}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="flex-1 pt-1 text-sm font-medium text-paper-800">{message}</p>
      <button
        onClick={onDismiss}
        className="shrink-0 rounded p-1 text-paper-400 transition-colors hover:bg-paper-100 hover:text-paper-600"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}