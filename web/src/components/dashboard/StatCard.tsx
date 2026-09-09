'use client';

import type { ReactNode } from 'react';

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`card p-5 ${accent ? 'border-brand-200 bg-brand-50/40' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-paper-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-paper-900">{value}</p>
        </div>
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ${
            accent ? 'bg-brand-700 text-white' : 'bg-paper-100 text-paper-500'
          }`}
        >
          {icon}
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-paper-400">{hint}</p>}
    </div>
  );
}
