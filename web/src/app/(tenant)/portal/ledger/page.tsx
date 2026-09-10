'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, ScrollText, Landmark } from 'lucide-react';
import { api, formatMoney, formatDateTime, titleCase } from '@/lib/api';
import { tenantQueryKeys, useTenantPrimary, openPdf } from '@/lib/tenant';
import { getErrorMessage } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import type { TenantStatement } from '@/types/tenant';

export default function TenantLedgerPage() {
  const { tenancy, loading: tenancyLoading } = useTenantPrimary();
  const { error: toastError } = useToast();

  const statementQ = useQuery({
    queryKey: tenantQueryKeys.statement(tenancy?.id ?? 'none'),
    queryFn: () =>
      api.get<TenantStatement>(
        `/tenants/me/tenancies/${tenancy!.id}/ledger/statement`,
      ),
    enabled: Boolean(tenancy),
  });

  if (tenancyLoading) {
    return (
      <div>
        <PageHeader title="Ledger" description="A running record of charges and payments" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!tenancy) {
    return (
      <div>
        <PageHeader title="Ledger" description="A running record of charges and payments" />
        <EmptyState
          icon={<ScrollText className="h-10 w-10" />}
          title="No active tenancy"
          description="Your ledger statement will appear here once a tenancy is active."
        />
      </div>
    );
  }

  const statement = statementQ.data;
  const entries = statement?.entries ?? [];

  const download = async () => {
    try {
      await openPdf(`/tenants/me/tenancies/${tenancy.id}/ledger/statement/pdf`);
    } catch (err) {
      toastError(getErrorMessage(err));
    }
  };

  return (
    <div>
      <PageHeader
        title="Ledger"
        description="A running record of charges and payments"
        actions={
          <button className="btn-secondary" onClick={download} disabled={statementQ.isLoading}>
            <Download className="h-4 w-4" />
            Download statement
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Stat
          label="Opening balance"
          value={statement ? formatMoney(statement.openingBalance) : '…'}
          icon={<Landmark className="h-5 w-5" />}
        />
        <Stat
          label="Closing balance"
          value={statement ? formatMoney(statement.closingBalance) : '…'}
          icon={<Landmark className="h-5 w-5" />}
          accent
        />
      </div>

      <h2 className="mb-3 mt-8 text-sm font-semibold text-paper-800">Statement entries</h2>
      <div className="surface overflow-hidden">
        {statementQ.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full" />
            ))}
          </div>
        ) : !entries.length ? (
          <div className="px-6 py-10 text-center text-sm text-paper-400">No ledger entries yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-paper-200 bg-paper-50/60 text-xs uppercase tracking-wide text-paper-400">
                  <th className="px-5 py-2.5 font-medium">Date</th>
                  <th className="px-5 py-2.5 font-medium">Description</th>
                  <th className="px-5 py-2.5 font-medium">Type</th>
                  <th className="px-5 py-2.5 text-right font-medium">Debit (KES)</th>
                  <th className="px-5 py-2.5 text-right font-medium">Credit (KES)</th>
                  <th className="px-5 py-2.5 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-paper-100 last:border-0">
                    <td className="whitespace-nowrap px-5 py-3 text-paper-600">{formatDateTime(e.createdAt)}</td>
                    <td className="px-5 py-3 text-paper-800">
                      {e.description ?? '—'}
                      {e.reversesEntryId && (
                        <span className="ml-2 text-xs text-paper-400">(reversal)</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-medium uppercase text-paper-500">
                        {titleCase(e.entryType)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-paper-800">
                      {e.signedAmount > 0 ? formatMoney(e.signedAmount) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-emerald-700">
                      {e.signedAmount < 0 ? formatMoney(Math.abs(e.signedAmount)) : '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-medium tabular-nums text-paper-900">
                      {formatMoney(e.runningBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({
  label, value, icon, accent = false,
}: {
  label: string; value: string; icon: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className={`surface p-5 ${accent ? 'border-brand-200 bg-brand-50/30' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-paper-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tightest tabular-nums text-paper-900">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${accent ? 'bg-brand-700 text-white' : 'bg-paper-100 text-paper-500'}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}