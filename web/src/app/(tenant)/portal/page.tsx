'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Wallet, CalendarClock, Coins, Wrench, Building2, DoorOpen, Calendar,
  ArrowRight, Megaphone, CreditCard, ReceiptText,
} from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatMoney, formatDate, formatDateTime, titleCase, toNumber } from '@/lib/api';
import { tenantQueryKeys } from '@/lib/tenant';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatGridSkeleton, Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { TenantDashboardData } from '@/types/tenant';

export default function TenantHomePage() {
  const { user } = useAuth();
  const dashboardQ = useQuery({
    queryKey: tenantQueryKeys.dashboard,
    queryFn: () => api.get<TenantDashboardData>('/tenants/me/dashboard'),
  });

  if (dashboardQ.isLoading) {
    return (
      <div>
        <PageHeader title={`Good day, ${user?.firstName ?? 'there'}`} description="Here's what's happening with your tenancy" />
        <StatGridSkeleton count={4} />
      </div>
    );
  }

  if (dashboardQ.isError) {
    return (
      <div className="surface p-8 text-center text-sm text-paper-500">
        {getErrorMessage(dashboardQ.error)}
      </div>
    );
  }

  const dash = dashboardQ.data;

  if (!dash || !dash.hasActiveTenancy || !dash.tenancy) {
    return (
      <div>
        <PageHeader title={`Good day, ${user?.firstName ?? 'there'}`} description="Here's what's happening with your tenancy" />
        <EmptyState
          icon={<DoorOpen className="h-10 w-10" />}
          title="No active tenancy"
          description={dash?.message ?? "You don't have an active tenancy just yet. Once your tenancy is set up, everything will appear here."}
          action={
            <Link href="/portal/profile" className="btn-secondary">
              Review my profile
            </Link>
          }
        />
      </div>
    );
  }

  const t = dash.tenancy;
  const charges = dash.recentCharges ?? [];
  const notifications = dash.recentNotifications ?? [];
  const due = charges.find((c) => ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'].includes(c.status));

  return (
    <div>
      <PageHeader
        title={`Good day, ${user?.firstName ?? 'there'}`}
        description={`${t.property.name}${t.building ? ` · ${t.building.name}` : ''} · Unit ${t.unit.unitNumber}`}
        actions={
          <Link href="/portal/rent" className="btn-primary">
            Pay rent
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Current balance"
          value={formatMoney(dash.currentBalance ?? 0)}
          icon={<Wallet className="h-5 w-5" />}
          accent
        />
        <Stat
          label="Rent per period"
          value={formatMoney(dash.currentRentAmount ?? 0)}
          icon={<Coins className="h-5 w-5" />}
        />
        <Stat
          label="Next due date"
          value={dash.nextDueDate ? formatDate(dash.nextDueDate) : '—'}
          icon={<CalendarClock className="h-5 w-5" />}
        />
        <Stat
          label="Rent status"
          value={dash.rentStatus ? titleCase(dash.rentStatus) : '—'}
          icon={<CreditCard className="h-5 w-5" />}
          hint={due ? `${formatMoney(toNumber(due.amount) - toNumber(due.amountPaid))} outstanding on this charge` : undefined}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-paper-800">Recent charges</h2>
            <Link href="/portal/rent" className="flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
              My rent <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="surface overflow-hidden">
            {!charges.length ? (
              <div className="px-6 py-10 text-center text-sm text-paper-400">You&apos;ll see your monthly rent charges here once they&apos;re generated.</div>
            ) : (
              <table className="w-full border-collapse">
                <tbody>
                  {charges.map((c) => (
                    <tr key={c.id} className="border-t border-paper-100 first:border-0">
                      <td className="px-5 py-3">
                        <div className="text-sm font-medium text-paper-800">
                          {formatDate(c.billingPeriodStart)} – {formatDate(c.billingPeriodEnd)}
                        </div>
                        <div className="text-xs text-paper-400">Due {formatDate(c.dueDate)}</div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="text-sm font-semibold tabular-nums text-paper-900">
                          {formatMoney(c.amount)}
                        </div>
                        <div className="text-xs text-paper-400">
                          Paid {formatMoney(c.amountPaid)}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <StatusBadge status={c.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="space-y-4">
          <section className="surface p-5">
            <h3 className="text-sm font-semibold text-paper-800">Your unit</h3>
            <dl className="mt-3 space-y-3">
              <div className="flex items-center gap-3">
                <Building2 className="h-4 w-4 text-paper-400" />
                <div>
                  <dt className="text-xs text-paper-400">Property</dt>
                  <dd className="text-sm font-medium text-paper-800">{t.property.name}</dd>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <DoorOpen className="h-4 w-4 text-paper-400" />
                <div>
                  <dt className="text-xs text-paper-400">Unit</dt>
                  <dd className="text-sm font-medium text-paper-800">
                    {t.unit.unitNumber}
                    {t.unit.floor ? ` · Floor ${t.unit.floor}` : ''}
                    <span className="ml-1.5 text-xs font-normal text-paper-400">
                      {titleCase(t.unit.unitTypeDefinition?.typeName ?? 'Unit')}
                    </span>
                  </dd>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-paper-400" />
                <div>
                  <dt className="text-xs text-paper-400">Tenancy</dt>
                  <dd className="text-sm font-medium text-paper-800">
                    {formatDate(t.startDate)}
                    {t.expectedEndDate ? ` → ${formatDate(t.expectedEndDate)}` : ''}
                  </dd>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Wrench className="h-4 w-4 text-paper-400" />
                <div>
                  <dt className="text-xs text-paper-400">Open maintenance</dt>
                  <dd className="text-sm font-medium text-paper-800">
                    {dash.openMaintenanceRequests ?? 0} request{(dash.openMaintenanceRequests ?? 0) === 1 ? '' : 's'}
                  </dd>
                </div>
              </div>
            </dl>
          </section>

          {dash.lastPayment && (
            <section className="surface p-5">
              <h3 className="text-sm font-semibold text-paper-800">Last payment</h3>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold tabular-nums text-paper-900">
                    {formatMoney(dash.lastPayment.amount)}
                  </div>
                  <div className="text-xs text-paper-400">
                    {titleCase(dash.lastPayment.method)} · {formatDateTime(dash.lastPayment.confirmedAt || dash.lastPayment.createdAt)}
                  </div>
                </div>
                <StatusBadge status={dash.lastPayment.status} />
              </div>
            </section>
          )}

          {dash.latestReceipt && (
            <section className="surface p-5">
              <h3 className="text-sm font-semibold text-paper-800">Latest receipt</h3>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold tabular-nums text-paper-900">
                    {formatMoney(dash.latestReceipt.amount)}
                  </div>
                  <div className="text-xs text-paper-400">{dash.latestReceipt.receiptNumber}</div>
                </div>
                <ReceiptText className="h-5 w-5 text-paper-300" />
              </div>
            </section>
          )}
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-paper-800">Notifications</h2>
          <div className="space-y-3">
            {!notifications.length ? (
              <div className="surface px-5 py-8 text-center text-sm text-paper-400">No notifications yet — we&apos;ll let you know when there&apos;s something for you.</div>
            ) : (
              notifications.slice(0, 5).map((n) => (
                <div key={n.id} className="surface px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-medium text-paper-800">{n.title}</h3>
                    <Megaphone className="h-4 w-4 shrink-0 text-paper-300" />
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-paper-500">{n.body}</p>
                  <p className="mt-1.5 text-xs text-paper-400">{formatDateTime(n.createdAt)}</p>
                </div>
              ))
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-paper-800">Balance summary</h2>
          <div className="surface p-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-sm font-medium text-paper-500">Outstanding balance</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums text-paper-900">
                  {formatMoney(dash.currentBalance ?? 0)}
                </p>
              </div>
              <Wallet className="h-8 w-8 text-paper-300" />
            </div>
            <p className="mt-3 text-xs text-paper-400">
              {due
                ? `Next charge of ${formatMoney(toNumber(due.amount))} is due ${formatDate(due.dueDate)}.`
                : 'All caught up — no outstanding charges right now.'}
            </p>
            <Link href="/portal/rent" className="mt-4 btn-primary w-full">
              Make a payment
            </Link>
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