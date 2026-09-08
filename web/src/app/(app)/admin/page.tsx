'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, Users, Coins, Building2 } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatDateTime, formatMoney } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import { useToast } from '@/lib/toast';
import type { AdminOrganization, PaginationMeta } from '@/types';

export default function AdminPage() {
  const { user } = useAuth();
  const { error } = useToast();
  const isAdmin = user?.platformRole === 'SUPER_ADMIN' || user?.platformRole === 'SUPPORT_ADMIN';

  const [orgs, setOrgs] = useState<AdminOrganization[]>([]);
  const [orgMeta, setOrgMeta] = useState<PaginationMeta>();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [stats, setStats] = useState<Record<string, number>>({});

  const load = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const [o, d] = await Promise.all([
          api.getList<AdminOrganization>('/admin/organizations', {
            page,
            limit: 20,
            search: search || undefined,
          }),
          api.get<Record<string, number>>('/admin/dashboard').catch(() => ({})),
        ]);
        setOrgs(o.items);
        setOrgMeta(o.meta);
        setStats(d ?? {});
      } catch (e) {
        error(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [search, error],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  if (!isAdmin) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm text-ink-500">
          You don&apos;t have permission to view the platform admin console.
        </p>
      </div>
    );
  }

  if (loading && orgs.length === 0) return <PageLoader />;

  const statCards = [
    {
      label: 'Organizations',
      value: String(stats.organizations ?? orgMeta?.total ?? 0),
      icon: <Building2 className="h-5 w-5" />,
    },
    { label: 'Users', value: String(stats.users ?? '—'), icon: <Users className="h-5 w-5" /> },
    {
      label: 'Revenue',
      value: formatMoney(stats.revenue ?? 0, 'KES'),
      icon: <Coins className="h-5 w-5" />,
    },
  ];

  return (
    <div>
      <PageHeader title="Platform Admin" description="Manage organizations across the platform" />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {statCards.map((s) => (
          <div key={s.label} className="card flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
              {s.icon}
            </div>
            <div>
              <div className="text-sm text-ink-500">{s.label}</div>
              <div className="text-xl font-semibold text-ink-900">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <input
            className="input pl-9"
            placeholder="Search organizations…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(1)}
          />
        </div>
      </div>

      <DataTable<AdminOrganization>
        columns={[
          {
            key: 'name',
            header: 'Organization',
            render: (o) => (
              <div>
                <div className="font-medium text-ink-800">{o.name}</div>
                <div className="text-xs text-ink-400">{o.slug}</div>
              </div>
            ),
          },
          {
            key: 'contactEmail',
            header: 'Contact',
            render: (o) => <span className="text-ink-600">{o.contactEmail || '—'}</span>,
          },
          {
            key: 'verificationStatus',
            header: 'Verification',
            render: (o) => <StatusBadge status={o.verificationStatus} />,
          },
          {
            key: 'createdAt',
            header: 'Joined',
            render: (o) => <span className="text-ink-600">{formatDateTime(o.createdAt)}</span>,
          },
        ]}
        rows={orgs}
        keyField={(o) => o.id}
      />
      <Pagination meta={orgMeta} onPageChange={(p) => load(p)} />
    </div>
  );
}
