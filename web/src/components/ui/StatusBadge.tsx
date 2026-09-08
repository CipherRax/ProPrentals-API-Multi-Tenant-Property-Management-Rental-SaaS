'use client';

import { Fragment, type ReactNode } from 'react';
import { titleCase } from '@/lib/api';

const tones: Record<string, { bg: string; text: string; dot?: string }> = {
  green: { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-700' },
  red: { bg: 'bg-red-50', text: 'text-red-700' },
  blue: { bg: 'bg-sky-50', text: 'text-sky-700' },
  gray: { bg: 'bg-ink-100', text: 'text-ink-600' },
  brand: { bg: 'bg-brand-50', text: 'text-brand-700' },
  purple: { bg: 'bg-violet-50', text: 'text-violet-700' },
};

const map: Record<string, string> = {
  ACTIVE: 'green',
  PAID: 'green',
  SUCCESSFUL: 'green',
  FULLY_PAID: 'green',
  VERIFIED: 'green',
  RESOLVED: 'green',
  CLOSED: 'green',
  OCCUPIED: 'blue',
  AVAILABLE: 'blue',
  PENDING: 'amber',
  INVITED: 'amber',
  OPEN: 'blue',
  ASSIGNED: 'blue',
  IN_PROGRESS: 'blue',
  PARTIALLY_PAID: 'amber',
  OVERDUE: 'red',
  FAILED: 'red',
  EXPIRED: 'red',
  TERMINATED: 'red',
  CANCELLED: 'gray',
  UNPAID: 'gray',
  INACTIVE: 'gray',
  WAIVED: 'gray',
  REVOKED: 'gray',
  FREE: 'gray',
  STARTER: 'blue',
  BUSINESS: 'amber',
  ENTERPRISE: 'purple',
  TRIAL: 'blue',
  PAST_DUE: 'red',
  SUSPENDED: 'red',
  NEW: 'blue',
  CONTACTED: 'amber',
  INTERESTED: 'amber',
  CONVERTED: 'green',
  SPAM: 'gray',
  REJECTED: 'red',
  UNVERIFIED: 'gray',
  HIGH: 'red',
  URGENT: 'red',
  MEDIUM: 'amber',
  LOW: 'gray',
  RESERVED: 'blue',
  MAINTENANCE: 'amber',
  UNAVAILABLE: 'gray',
};

export function StatusBadge({
  status,
  children,
}: {
  status?: string | null;
  children?: ReactNode;
}) {
  const key = (status ?? '').toUpperCase();
  const tone = map[key] ?? 'gray';
  const styles = tones[tone] ?? tones.gray;
  const label = children ?? titleCase(status ?? 'Unknown');
  return (
    <span className={`badge ${styles.bg} ${styles.text}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

export function Stack({ items }: { items: ReactNode[] }) {
  return (
    <Fragment>
      {items.map((item, i) => (
        <Fragment key={i}>{item}</Fragment>
      ))}
    </Fragment>
  );
}
