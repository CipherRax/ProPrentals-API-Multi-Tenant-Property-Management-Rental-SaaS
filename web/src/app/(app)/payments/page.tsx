'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, CreditCard } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatMoney, formatDateTime } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/lib/toast';
import type { Payment, PaginationMeta, Tenancy } from '@/types';

export default function PaymentsPage() {
  const { activeOrg } = useAuth();
  const { error, success } = useToast();

  const [items, setItems] = useState<Payment[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tenancies, setTenancies] = useState<Tenancy[]>([]);
  const [form, setForm] = useState({
    tenancyId: '',
    amount: '',
    method: 'CASH',
    manualReference: '',
    notes: '',
  });

  const load = useCallback(
    async (page = 1) => {
      if (!activeOrg) return;
      setLoading(true);
      try {
        const d = await api.getList<Payment>(`/organizations/${activeOrg.id}/payments`, {
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
    if (activeOrg) {
      api
        .getList<Tenancy>(`/organizations/${activeOrg.id}/tenancies`, {
          limit: 100,
          status: 'ACTIVE',
        })
        .then((d) => setTenancies(d.items))
        .catch(() => {});
    }
  }, [activeOrg, load]);

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const record = async () => {
    if (!activeOrg) return;
    setSaving(true);
    try {
      await api.post(`/organizations/${activeOrg.id}/tenancies/${form.tenancyId}/payments/manual`, {
        amount: Number(form.amount),
        method: form.method,
        manualReference: form.manualReference || undefined,
        notes: form.notes || undefined,
      });
      success(`Payment of ${formatMoney(Number(form.amount), currency)} recorded.`);
      setPayOpen(false);
      setForm({ tenancyId: '', amount: '', method: 'CASH', manualReference: '', notes: '' });
      load(1);
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading && items.length === 0) return <PageLoader />;

  const currency = activeOrg?.currency ?? 'KES';

  return (
    <div>
      <PageHeader
        title="Payments"
        description="Recorded rent payments and their status"
        actions={
          <button className="btn-primary" onClick={() => setPayOpen(true)}>
            <Plus className="h-4 w-4" /> Record payment
          </button>
        }
      />

      {items.length === 0 && !loading ? (
        <EmptyState
          icon={<CreditCard className="h-8 w-8" />}
          title="No payments yet"
          description="Record a payment against an active tenancy to keep your financials up to date."
          action={
            <button className="btn-primary" onClick={() => setPayOpen(true)}>
              <Plus className="h-4 w-4" /> Record payment
            </button>
          }
        />
      ) : (
        <>
          <DataTable<Payment>
            columns={[
              {
                key: 'tenant',
                header: 'Tenant',
                render: (p) => (
                  <div>
                    <div className="font-medium text-paper-800">
                      {p.tenancy?.tenant?.fullName || '—'}
                    </div>
                    <div className="text-xs text-paper-400">
                      Unit {p.tenancy?.unit?.unitNumber || '—'}
                    </div>
                  </div>
                ),
              },
              {
                key: 'amount',
                header: 'Amount',
                render: (p) => (
                  <span className="font-medium text-paper-800">
                    {formatMoney(p.amount, currency)}
                  </span>
                ),
              },
              {
                key: 'method',
                header: 'Method',
                render: (p) => (
                  <span className="capitalize text-paper-600">
                    {p.method.toLowerCase().replace(/_/g, ' ')}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (p) => <StatusBadge status={p.status} />,
              },
              {
                key: 'paidAt',
                header: 'Paid',
                render: (p) => (
                  <span className="text-paper-600">{formatDateTime(p.paidAt || p.createdAt)}</span>
                ),
              },
            ]}
            rows={items}
            keyField={(p) => p.id}
          />
          <Pagination meta={meta} onPageChange={(p) => load(p)} />
        </>
      )}

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Record payment"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setPayOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={record}
              disabled={saving || !form.tenancyId || !form.amount}
            >
              {saving ? 'Recording…' : 'Record payment'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Tenancy *</label>
            <select
              className="input"
              value={form.tenancyId}
              onChange={(e) => update('tenancyId', e.target.value)}
            >
              <option value="">Select tenancy</option>
              {tenancies.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.tenant?.fullName ?? 'Tenant'} · Unit {t.unit?.unitNumber ?? '—'}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Amount (KSh) *</label>
            <input
              className="input"
              type="number"
              value={form.amount}
              onChange={(e) => update('amount', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Method</label>
            <select
              className="input"
              value={form.method}
              onChange={(e) => update('method', e.target.value)}
            >
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank transfer</option>
              <option value="MPESA">M-Pesa</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div>
            <label className="label">Reference</label>
            <input
              className="input"
              value={form.manualReference}
              onChange={(e) => update('manualReference', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input h-20"
              value={form.notes}
              onChange={(e) => update('notes', e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
