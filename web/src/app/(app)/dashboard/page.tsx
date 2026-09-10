'use client';

import Link from 'next/link';
import { Coins, Building2, Percent, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
} from 'recharts';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatMoney, formatDateTime } from '@/lib/api';
import { queryKeys } from '@/lib/queryKeys';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatGridSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { canAny } from '@/lib/rbac';
import type { FinancialReport, OccupancyReport, Property, Payment, Announcement } from '@/types';

const METHOD_COLORS: Record<string, string> = {
  MPESA: '#00A550',
  CASH: '#bf8f2e',
  BANK_TRANSFER: '#0B4A26',
  OTHER: '#6B7280',
};

export default function DashboardPage() {
  const { activeOrg, user, organizations } = useAuth();
  const role = activeOrg?.myRole;
  const orgId = activeOrg?.id;

  const canFinancials = canAny(role, ['report:read', 'payment:read']);

  const orgKey = orgId ?? 'none';

  const financialQ = useQuery({
    queryKey: queryKeys.reports.financial(orgKey),
    queryFn: () => api.get<FinancialReport>(`/organizations/${orgId}/reports/financial`),
    enabled: Boolean(orgId) && canFinancials,
  });

  const occupancyQ = useQuery({
    queryKey: queryKeys.reports.occupancy(orgKey),
    queryFn: () => api.get<OccupancyReport>(`/organizations/${orgId}/reports/occupancy`),
    enabled: Boolean(orgId) && canFinancials,
  });

  const breakdownQ = useQuery({
    queryKey: ['orgs', orgKey, 'reports', 'payment-breakdown'],
    queryFn: () => api.get<{ byMethod: { method: string; _sum: { amount: number } | null }[] }>(
      `/organizations/${orgId}/reports/financial/payment-breakdown`,
    ),
    enabled: Boolean(orgId) && canFinancials,
  });

  const propertiesQ = useQuery({
    queryKey: [...queryKeys.properties(orgKey), 'limit5'],
    queryFn: () => api.getList<Property>(`/organizations/${orgId}/properties`, { limit: 5 }),
    enabled: Boolean(orgId),
  });

  const paymentsQ = useQuery({
    queryKey: [...queryKeys.payments(orgKey), 'limit5'],
    queryFn: () => api.getList<Payment>(`/organizations/${orgId}/payments`, { limit: 5 }),
    enabled: Boolean(orgId) && canFinancials,
  });

  const announcementsQ = useQuery({
    queryKey: [...queryKeys.announcements(orgKey), 'limit4'],
    queryFn: () => api.getList<Announcement>(`/organizations/${orgId}/announcements`, { limit: 4 }),
    enabled: Boolean(orgId),
  });

  const currency = activeOrg?.currency ?? 'KES';
  const financial = financialQ.data;
  const occupancy = occupancyQ.data;
  const properties = propertiesQ.data?.items ?? [];
  const recentPayments = paymentsQ.data?.items ?? [];
  const announcements = announcementsQ.data?.items ?? [];

  const breakdownData = (breakdownQ.data?.byMethod ?? [])
    .filter((d) => d._sum?.amount != null)
    .map((d) => ({
      name: d.method.toLowerCase().replace(/_/g, ' '),
      value: Number(d._sum!.amount),
      color: METHOD_COLORS[d.method] ?? '#969282',
    }));

  const loadingMain = (!financialQ.isSuccess && financialQ.isFetching) ||
    (!occupancyQ.isSuccess && occupancyQ.isFetching);

  if (!activeOrg) {
    return (
      <div className="surface p-8 text-center text-sm text-paper-500">
        You don&apos;t have an organization yet. Create one to get started.
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={`Good day, ${user?.firstName ?? 'there'}`}
        description={activeOrg.name}
        actions={
          <Link href="/properties" className="btn-primary">
            New property
          </Link>
        }
      />

      {loadingMain ? (
        <StatGridSkeleton count={4} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Collected rent"
            value={formatMoney(financial?.collectedRent ?? 0, currency)}
            icon={<Coins className="h-5 w-5" />}
            accent
            hint={financial ? `Collection rate ${Math.round((financial.collectionRate ?? 0) * 100)}%` : undefined}
          />
          <Stat
            label="Outstanding"
            value={formatMoney(financial?.outstandingRent ?? 0, currency)}
            icon={<Coins className="h-5 w-5" />}
          />
          <Stat
            label="Occupancy"
            value={occupancy ? `${occupancy.occupancyRate}%` : '—'}
            icon={<Percent className="h-5 w-5" />}
            hint={occupancy ? `${occupancy.occupiedUnits} of ${occupancy.totalUnits} units occupied` : 'Upgrade to the Reports plan to see occupancy data'}
          />
          <Stat
            label="Properties"
            value={String(properties.length)}
            icon={<Building2 className="h-5 w-5" />}
          />
        </div>
      )}

      {canFinancials && breakdownData.length > 0 && (
        <section className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="surface p-5 lg:col-span-1">
            <h3 className="text-sm font-semibold text-paper-800">Collected by payment method</h3>
            <p className="mt-0.5 text-xs text-paper-400">Successful payments</p>
            <div className="mt-4 h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={breakdownData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
                    {breakdownData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatMoney(Number(value), currency)}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e8e7e0', fontSize: 13 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 space-y-1.5">
              {breakdownData.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-paper-600">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
                    {d.name}
                  </span>
                  <span className="font-medium tabular-nums text-paper-800">
                    {formatMoney(d.value, currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <section className="lg:col-span-2">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-paper-800">Recent payments</h2>
              <Link href="/payments" className="flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
                View all <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="surface overflow-hidden">
              {!recentPayments.length ? (
                <div className="px-6 py-10 text-center text-sm text-paper-400">
                  No payments recorded yet. Payments will show up here once tenants start paying.
                </div>
              ) : (
                <table className="w-full border-collapse">
                  <tbody>
                    {recentPayments.map((p) => (
                      <tr key={p.id} className="border-t border-paper-100 first:border-0">
                        <td className="px-5 py-3">
                          <div className="text-sm font-medium text-paper-800">
                            {p.tenancy?.tenant?.fullName || 'Payment'}
                          </div>
                          <div className="text-xs text-paper-400">
                            {p.tenancy?.unit?.unitNumber || p.method} · {formatDateTime(p.paidAt || p.createdAt)}
                          </div>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <div className="text-sm font-semibold tabular-nums text-paper-900">
                            {formatMoney(p.amount, currency)}
                          </div>
                          <StatusBadge status={p.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </section>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-paper-800">Properties</h2>
            <Link href="/properties" className="flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
              Manage <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="surface divide-y divide-paper-100">
            {!properties.length ? (
              <div className="px-6 py-10 text-center text-sm text-paper-400">No properties yet. Add your first property to get started.</div>
            ) : (
              properties.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <div className="text-sm font-medium text-paper-800">{p.name}</div>
                    <div className="text-xs capitalize text-paper-400">
                      {p.propertyType.toLowerCase().replace(/_/g, ' ')}
                    </div>
                  </div>
                  <StatusBadge status={p.status} />
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-paper-800">Latest announcements</h2>
          <div className="space-y-3">
            {!announcements.length ? (
              <div className="surface px-5 py-8 text-center text-sm text-paper-400">No announcements yet. Create one to keep your tenants in the loop.</div>
            ) : (
              announcements.map((a) => (
                <div key={a.id} className="surface px-5 py-4">
                  <h3 className="text-sm font-medium text-paper-800">{a.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-paper-500">{a.message}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({
  label, value, hint, icon, accent = false,
}: {
  label: string; value: string; hint?: string; icon: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className={`surface p-5 ${accent ? 'border-brand-200 bg-brand-50/30' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-paper-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums text-paper-900">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${accent ? 'bg-brand-700 text-white' : 'bg-paper-100 text-paper-500'}`}>
          {icon}
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-paper-400">{hint}</p>}
    </div>
  );
}
