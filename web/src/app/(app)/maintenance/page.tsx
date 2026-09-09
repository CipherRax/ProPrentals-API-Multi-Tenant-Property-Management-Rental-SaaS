'use client';

import { useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatDateTime, titleCase } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { useToast } from '@/lib/toast';
import type { MaintenanceRequest, PaginationMeta } from '@/types';

export default function MaintenancePage() {
  const { activeOrg } = useAuth();
  const { error } = useToast();

  const [items, setItems] = useState<MaintenanceRequest[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg?.id]);

  async function load(page = 1) {
    if (!activeOrg) return;
    setLoading(true);
    try {
      const d = await api.getList<MaintenanceRequest>(
        `/organizations/${activeOrg.id}/maintenance`,
        { page, limit: 20 },
      );
      setItems(d.items);
      setMeta(d.meta);
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  if (loading && items.length === 0) return <PageLoader />;

  return (
    <div>
      <PageHeader title="Maintenance" description="Track and resolve maintenance requests" />

      {items.length === 0 && !loading ? (
        <EmptyState
          icon={<Wrench className="h-8 w-8" />}
          title="No maintenance requests"
          description="Requests submitted by tenants will appear here."
        />
      ) : (
        <>
          <DataTable<MaintenanceRequest>
            columns={[
              {
                key: 'title',
                header: 'Request',
                render: (m) => (
                  <div>
                    <div className="font-medium text-paper-800">{m.title}</div>
                    <div className="line-clamp-1 max-w-md text-xs text-paper-400">
                      {m.description}
                    </div>
                  </div>
                ),
              },
              {
                key: 'tenant',
                header: 'Tenant',
                render: (m) => <span className="text-paper-600">{m.tenant?.fullName || '—'}</span>,
              },
              {
                key: 'category',
                header: 'Category',
                render: (m) => (
                  <span className="text-paper-600">{titleCase(m.category.toLowerCase())}</span>
                ),
              },
              {
                key: 'priority',
                header: 'Priority',
                render: (m) => <StatusBadge status={m.priority} />,
              },
              {
                key: 'status',
                header: 'Status',
                render: (m) => <StatusBadge status={m.status} />,
              },
              {
                key: 'createdAt',
                header: 'Created',
                render: (m) => <span className="text-paper-600">{formatDateTime(m.createdAt)}</span>,
              },
            ]}
            rows={items}
            keyField={(m) => m.id}
          />
          <Pagination meta={meta} onPageChange={(p) => load(p)} />
        </>
      )}
    </div>
  );
}
