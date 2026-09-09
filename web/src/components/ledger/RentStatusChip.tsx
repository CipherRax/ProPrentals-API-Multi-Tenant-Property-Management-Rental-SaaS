'use client';

import { cn } from '@/lib/utils';
import {
  CheckCircle2, AlertTriangle, Clock, Ban, CircleDollarSign, XCircle, Circle,
} from 'lucide-react';

export type RentStatusValue =
  | 'PAID'
  | 'UNPAID'
  | 'PARTIALLY_PAID'
  | 'PAYMENT_PENDING'
  | 'OVERDUE'
  | 'FAILED'
  | 'OVERPAID'
  | 'WAIVED';

const statusConfig: Record<RentStatusValue, { label: string; className: string; icon: React.ReactNode }> = {
  PAID: {
    label: 'Paid',
    className: 'bg-emerald-50 text-emerald-700',
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  OVERPAID: {
    label: 'Overpaid',
    className: 'bg-emerald-50 text-emerald-700',
    icon: <CircleDollarSign className="h-3.5 w-3.5" />,
  },
  PARTIALLY_PAID: {
    label: 'Partially paid',
    className: 'bg-amber-50 text-amber-700',
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  PAYMENT_PENDING: {
    label: 'Payment pending',
    className: 'bg-amber-50 text-amber-700',
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  UNPAID: {
    label: 'Unpaid',
    className: 'bg-paper-100 text-paper-600',
    icon: <Circle className="h-3.5 w-3.5" />,
  },
  OVERDUE: {
    label: 'Overdue',
    className: 'bg-red-50 text-red-700',
    icon: <AlertTriangle className="h-3.5 w-3.5" />,
  },
  FAILED: {
    label: 'Failed',
    className: 'bg-red-50 text-red-700',
    icon: <XCircle className="h-3.5 w-3.5" />,
  },
  WAIVED: {
    label: 'Waived',
    className: 'bg-paper-100 text-paper-500',
    icon: <Ban className="h-3.5 w-3.5" />,
  },
};

/** A single, intentionally restrained chip for rent/account status. */
export function RentStatusChip({ status }: { status: string | null | undefined }) {
  const key = ((status ?? '').toUpperCase() === 'PAID' ? 'PAID' : (status ?? '').toUpperCase()) as RentStatusValue;
  const cfg = statusConfig[key] ?? {
    label: status ? key.toLowerCase().replace(/_/g, ' ') : 'Unknown',
    className: 'bg-paper-100 text-paper-600',
    icon: <Circle className="h-3.5 w-3.5" />,
  };

  return (
    <span className={cn('badge', cfg.className)}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}
