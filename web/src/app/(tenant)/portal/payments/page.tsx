'use client';

import { useQuery } from '@tanstack/react-query';
import { CreditCard } from 'lucide-react';
import { api, formatMoney, formatDateTime, titleCase } from '@/lib/api';
import { tenantQueryKeys } from '@/lib/tenant';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { TableSkeleton } from '@/components/ui/Skeleton';
import type { TenantPayment } from '@/types/tenant';

export default function TenantPaymentsPage() {
  const paymentsQ = useQuery({
    queryKey: tenantQueryKeys.payments,
    queryFn: () => api.get<TenantPayment[]>('/tenants/me/payments'),
  });

  const payments = Array.isArray(paymentsQ.data) ? paymentsQ.data : [];

  return (
    <div>
      <PageHeader title="Payments" description="Payment attempts and transactions on your account" />

      {paymentsQ.isLoading ? (
        <TableSkeleton rows={6} cols={4} />
      ) : !payments.length ? (
        <EmptyState
          icon={<CreditCard className="h-10 w-10" />}
          title="No payments yet"
          description="When you make a payment it will show up here."
        />
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-paper-200 bg-paper-50/60 text-xs uppercase tracking-wide text-paper-400">
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-5 py-2.5 font-medium">Method</th>
                  <th className="px-5 py-2.5 font-medium">Phone</th>
                  <th className="px-5 py-2.5 font-medium">Reference</th>
                  <th className="px-5 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-5 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-paper-100 last:border-0">
                    <td className="whitespace-nowrap px-5 py-3 text-paper-600">
                      {formatDateTime(p.confirmedAt || p.initiatedAt || p.createdAt)}
                    </td>
                    <td className="px-5 py-3 font-medium text-paper-800">{titleCase(p.method)}</td>
                    <td className="px-5 py-3 text-paper-600">{p.phoneNumber ?? '—'}</td>
                    <td className="px-5 py-3 text-paper-600">
                      {p.providerTransactionId ?? p.manualReference ?? '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-paper-800">
                      {formatMoney(p.amount, p.currency)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <StatusBadge status={p.status} />
                      {p.status === 'FAILED' && p.failureReason && (
                        <div className="mt-1 text-xs text-red-600">{p.failureReason}</div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}