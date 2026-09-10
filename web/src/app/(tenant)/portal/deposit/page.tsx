'use client';

import { useQuery } from '@tanstack/react-query';
import { PiggyBank } from 'lucide-react';
import { api, formatMoney, formatDateTime, titleCase, toNumber } from '@/lib/api';
import { tenantQueryKeys, useTenantPrimary } from '@/lib/tenant';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { TenantDeposit } from '@/types/tenant';

export default function TenantDepositPage() {
  const { tenancy, loading: tenancyLoading } = useTenantPrimary();

  const depositQ = useQuery({
    queryKey: tenantQueryKeys.deposit(tenancy?.id ?? 'none'),
    queryFn: () =>
      api.get<TenantDeposit>(`/tenants/me/tenancies/${tenancy!.id}/deposit`),
    enabled: Boolean(tenancy),
  });

  if (tenancyLoading) {
    return (
      <div>
        <PageHeader title="Security deposit" description="Status of your rental security deposit" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!tenancy) {
    return (
      <div>
        <PageHeader title="Security deposit" description="Status of your rental security deposit" />
        <EmptyState
          icon={<PiggyBank className="h-10 w-10" />}
          title="No active tenancy"
          description="Deposit details will appear here once a tenancy is active."
        />
      </div>
    );
  }

  if (depositQ.isLoading) {
    return (
      <div>
        <PageHeader title="Security deposit" description="Status of your rental security deposit" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const deposit = depositQ.data;

  if (!deposit) {
    return (
      <div>
        <PageHeader title="Security deposit" description="Status of your rental security deposit" />
        <EmptyState
          icon={<PiggyBank className="h-10 w-10" />}
          title="No deposit record"
          description="No security deposit has been recorded for this tenancy."
        />
      </div>
    );
  }

  const paidPct =
    toNumber(deposit.requiredAmount) > 0
      ? Math.round((toNumber(deposit.amountPaid) / toNumber(deposit.requiredAmount)) * 100)
      : 0;

  const transactions = deposit.transactions ?? [];

  return (
    <div>
      <PageHeader
        title="Security deposit"
        description="Status of your rental security deposit"
        actions={<StatusBadge status={deposit.status} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Required" value={formatMoney(deposit.requiredAmount)} accent />
        <Stat label="Paid" value={formatMoney(deposit.amountPaid)} />
        <Stat label="Deducted" value={formatMoney(deposit.amountDeducted)} />
        <Stat label="Refunded" value={formatMoney(deposit.amountRefunded)} />
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-paper-700">Payment progress</span>
          <span className="text-paper-500">{paidPct}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-paper-100">
          <div
            className="h-full rounded-full bg-brand-600 transition-all"
            style={{ width: `${Math.min(100, paidPct)}%` }}
          />
        </div>
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-paper-800">Transactions</h2>
      <div className="surface overflow-hidden">
        {!transactions.length ? (
          <div className="px-6 py-10 text-center text-sm text-paper-400">
            No deposit transactions recorded yet.
          </div>
        ) : (
          <div className="divide-y divide-paper-100">
            {transactions.map((t) => (
              <div key={t.id} className="flex items-center justify-between px-5 py-4">
                <div>
                  <div className="text-sm font-medium capitalize text-paper-800">
                    {titleCase(t.type)}
                    {t.reason ? ` · ${t.reason}` : ''}
                  </div>
                  <div className="text-xs text-paper-400">{formatDateTime(t.transactionDate)}</div>
                </div>
                <div
                  className={`text-sm font-semibold tabular-nums ${
                    t.type === 'DEDUCTION' ? 'text-red-600' : 'text-emerald-600'
                  }`}
                >
                  {t.type === 'DEDUCTION' ? '−' : '+'}
                  {formatMoney(t.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label, value, accent = false,
}: {
  label: string; value: string; accent?: boolean;
}) {
  return (
    <div className={`surface p-5 ${accent ? 'border-brand-200 bg-brand-50/30' : ''}`}>
      <p className="text-sm font-medium text-paper-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tightest tabular-nums text-paper-900">{value}</p>
    </div>
  );
}