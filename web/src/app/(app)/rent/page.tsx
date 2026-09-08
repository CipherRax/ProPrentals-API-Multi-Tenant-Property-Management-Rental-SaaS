'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Wallet } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatMoney } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { ConfirmModal } from '@/components/ui/Modal';
import { useToast } from '@/lib/toast';
import { findOrgRole } from '@/lib/org';
import type { RentCharge, PaginationMeta } from '@/types';

export default function RentPage() {
  const { activeOrg, organizations } = useAuth();
  const { error, success } = useToast();
  const role = findOrgRole(organizations, activeOrg?.id);

  const [items, setItems] = useState<RentCharge[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [waiveTarget, setWaiveTarget] = useState<RentCharge | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [waiving, setWaiving] = useState(false);

  const load = useCallback(
    async (page = 1) => {
      if (!activeOrg) return;
      setLoading(true);
      try {
        const d = await api.getList<RentCharge>(`/organizations/${activeOrg.id}/rent-charges`, {
          page,
          limit: 20,
        });
        setItems(d.items);
        setMeta(d.meta);
      } catch (e) {
        error(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [activeOrg, error],
  );

  useEffect(() => {
    load(1);
  }, [load]);

  const generateNow = async () => {
    if (!activeOrg) return;
    setGenerating(true);
    try {
      await api.post(`/organizations/${activeOrg.id}/rent-charges/generate-now`);
      success('Rent charges generated');
      load(1);
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setGenerating(false);
    }
  };

  const waive = async () => {
    if (!activeOrg || !waiveTarget) return;
    setWaiving(true);
    try {
      await api.patch(`/organizations/${activeOrg.id}/rent-charges/${waiveTarget.id}/waive`, {
        reason: 'Waived by property manager',
      });
      success('Charge waived');
      setConfirmOpen(false);
      setWaiveTarget(null);
      load(1);
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setWaiving(false);
    }
  };

  if (loading && items.length === 0) return <PageLoader />;

  const currency = activeOrg?.currency ?? 'KES';

  return (
    <div>
      <PageHeader
        title="Rent & Charges"
        description="Monthly rent charges across your portfolio"
        actions={
          role === 'OWNER' ? (
            <button className="btn-primary" onClick={generateNow} disabled={generating}>
              <RefreshCw className="h-4 w-4" />
              {generating ? 'Generating…' : 'Generate now'}
            </button>
          ) : undefined
        }
      />

      {items.length === 0 && !loading ? (
        <EmptyState
          icon={<Wallet className="h-8 w-8" />}
          title="No rent charges"
          description="Generate charges to bill your tenants."
          action={
            role === 'OWNER' ? (
              <button className="btn-primary" onClick={generateNow} disabled={generating}>
                <RefreshCw className="h-4 w-4" /> Generate charges
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTable<RentCharge>
            columns={[
              {
                key: 'tenant',
                header: 'Tenant',
                render: (r) => (
                  <div>
                    <div className="font-medium text-ink-800">
                      {r.tenancy?.tenant?.fullName || '—'}
                    </div>
                    <div className="text-xs text-ink-400">
                      Unit {r.tenancy?.unit?.unitNumber || '—'}
                    </div>
                  </div>
                ),
              },
              {
                key: 'period',
                header: 'Period',
                render: (r) => (
                  <span className="text-ink-600">
                    {new Date(r.periodStart).toLocaleDateString('en-KE', {
                      month: 'short',
                      year: 'numeric',
                    })}
                  </span>
                ),
              },
              {
                key: 'amount',
                header: 'Amount',
                render: (r) => (
                  <span className="font-medium text-ink-800">
                    {formatMoney(r.amount, currency)}
                  </span>
                ),
              },
              {
                key: 'paidAmount',
                header: 'Paid',
                render: (r) => (
                  <span className="text-ink-600">{formatMoney(r.paidAmount, currency)}</span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (r) => <StatusBadge status={r.status} />,
              },
              {
                key: 'actions',
                header: '',
                className: 'text-right',
                render: (r) =>
                  (r.status === 'UNPAID' || r.status === 'OVERDUE') && r.tenancy ? (
                    <button
                      className="btn-ghost text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setWaiveTarget(r);
                        setConfirmOpen(true);
                      }}
                    >
                      Waive
                    </button>
                  ) : null,
              },
            ]}
            rows={items}
            keyField={(r) => r.id}
          />
          <Pagination meta={meta} onPageChange={(p) => load(p)} />
        </>
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setWaiveTarget(null);
        }}
        onConfirm={waive}
        title="Waive rent charge"
        message={`Waive ${waiveTarget ? formatMoney(waiveTarget.amount, currency) : ''} for ${waiveTarget?.tenancy?.tenant?.fullName ?? 'this tenant'}?`}
        confirmLabel={waiving ? 'Waiving…' : 'Waive'}
        danger
        loading={waiving}
      />
    </div>
  );
}
