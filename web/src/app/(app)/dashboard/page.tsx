'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Currency, Building2, Percent, ArrowRight, Coins, Wrench } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatMoney } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/dashboard/StatCard';
import { PageLoader } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import type { FinancialReport, OccupancyReport, Property, Payment, Announcement } from '@/types';
import { useState, useEffect } from 'react';
import { useToast } from '@/lib/toast';
import { findOrgRole } from '@/lib/org';

export default function DashboardPage() {
  const { activeOrg, user, organizations } = useAuth();
  const { error } = useToast();
  const [loading, setLoading] = useState(true);
  const [financial, setFinancial] = useState<FinancialReport | null>(null);
  const [occupancy, setOccupancy] = useState<OccupancyReport | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  const role = useMemo(() => findOrgRole(organizations, activeOrg?.id), [organizations, activeOrg]);

  useEffect(() => {
    if (!activeOrg) return;
    let mounted = true;
    setLoading(true);

    const canReports = role === 'OWNER' || role === 'PROPERTY_MANAGER' || role === 'ACCOUNTANT';

    const tasks: Promise<unknown>[] = [api.get<{ organizations: unknown[] }>('/organizations/me')];

    if (canReports) {
      tasks.push(
        api.get<FinancialReport>(`/organizations/${activeOrg.id}/reports/financial`).then((d) => {
          if (mounted) setFinancial(d);
        }),
        api.get<OccupancyReport>(`/organizations/${activeOrg.id}/reports/occupancy`).then((d) => {
          if (mounted) setOccupancy(d);
        }),
      );
    }

    tasks.push(
      api
        .getList<Property>(`/organizations/${activeOrg.id}/properties`, { limit: 5 })
        .then((d) => {
          if (mounted) setProperties(d.items);
        })
        .catch(() => {}),
      api
        .getList<Payment>(`/organizations/${activeOrg.id}/payments`, { limit: 5 })
        .then((d) => {
          if (mounted) setRecentPayments(d.items);
        })
        .catch((e) => error(getErrorMessage(e))),
      api
        .getList<Announcement>(`/organizations/${activeOrg.id}/announcements`, { limit: 4 })
        .then((d) => {
          if (mounted) setAnnouncements(d.items);
        })
        .catch(() => {}),
    );

    Promise.all(tasks)
      .catch((e) => error(getErrorMessage(e)))
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [activeOrg, role, error]);

  if (!activeOrg) {
    return (
      <div className="card p-8 text-center text-sm text-ink-500">
        No organization available. Create one to get started.
      </div>
    );
  }

  if (loading) return <PageLoader />;

  const currency = activeOrg.currency || 'KES';

  return (
    <div>
      <PageHeader
        title={`Welcome, ${user?.firstName ?? 'there'}`}
        description={activeOrg.name}
        actions={
          <Link href="/properties" className="btn-primary">
            New property
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Collected (all-time)"
          value={formatMoney(financial?.collectedRent ?? 0, currency)}
          icon={<Coins className="h-5 w-5" />}
          accent
          hint={`Collection rate ${Math.round((financial?.collectionRate ?? 0) * 100)}%`}
        />
        <StatCard
          label="Outstanding rent"
          value={formatMoney(financial?.outstandingRent ?? 0, currency)}
          icon={<Currency className="h-5 w-5" />}
        />
        <StatCard
          label="Occupancy"
          value={occupancy ? `${occupancy.occupancyRate}%` : '—'}
          icon={<Percent className="h-5 w-5" />}
          hint={
            occupancy
              ? `${occupancy.occupiedUnits} of ${occupancy.totalUnits} units occupied`
              : 'Occupancy reporting requires the Reports plan'
          }
        />
        <StatCard
          label="Properties"
          value={String(properties.length)}
          icon={<Building2 className="h-5 w-5" />}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-800">Recent payments</h2>
            <Link
              href="/payments"
              className="flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
            >
              View all <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="card overflow-hidden">
            {recentPayments.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-ink-400">
                No payments recorded yet.
              </div>
            ) : (
              <table className="w-full border-collapse">
                <tbody>
                  {recentPayments.map((p) => (
                    <tr key={p.id} className="border-t border-ink-100 first:border-0">
                      <td className="px-5 py-3">
                        <div className="text-sm font-medium text-ink-800">
                          {p.tenancy?.tenant?.fullName || 'Payment'}
                        </div>
                        <div className="text-xs text-ink-400">
                          {p.tenancy?.unit?.unitNumber || p.method}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="text-sm font-semibold text-ink-900">
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

        <section>
          <h2 className="mb-3 text-sm font-semibold text-ink-800">Latest announcements</h2>
          <div className="space-y-3">
            {announcements.length === 0 ? (
              <div className="card px-5 py-8 text-center text-sm text-ink-400">
                No announcements yet.
              </div>
            ) : (
              announcements.slice(0, 4).map((a) => (
                <div key={a.id} className="card px-5 py-4">
                  <h3 className="text-sm font-medium text-ink-800">{a.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-ink-500">{a.message}</p>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-800">Properties</h2>
            <Link
              href="/properties"
              className="flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
            >
              Manage <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="card divide-y divide-ink-100">
            {properties.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-ink-400">No properties yet.</div>
            ) : (
              properties.map((p) => (
                <div key={p.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <div className="text-sm font-medium text-ink-800">{p.name}</div>
                    <div className="text-xs capitalize text-ink-400">
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
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-800">Maintenance</h2>
            <Link
              href="/maintenance"
              className="flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
            >
              Open <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="card flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-medium text-ink-700">Maintenance requests</div>
              <div className="text-xs text-ink-400">
                Track and resolve issues from the Maintenance page
              </div>
            </div>
            <div className="ml-auto flex h-10 w-10 items-center justify-center rounded-full bg-ink-100 text-sm font-semibold text-ink-600">
              <Wrench className="h-4 w-4" />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
