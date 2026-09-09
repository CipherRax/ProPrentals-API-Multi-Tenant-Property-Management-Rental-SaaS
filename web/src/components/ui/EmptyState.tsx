'use client';

import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-paper-200 bg-paper-50/40 px-6 py-16 text-center">
      {icon && <div className="mb-4 text-paper-300">{icon}</div>}
      <h3 className="text-base font-semibold text-paper-700">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-paper-400">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
