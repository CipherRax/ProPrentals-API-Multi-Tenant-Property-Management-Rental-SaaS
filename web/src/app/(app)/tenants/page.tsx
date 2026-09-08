'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Users, Search, Mail } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageLoader } from '@/components/ui/Spinner';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/Pagination';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/lib/toast';
import type { TenantProfile, PaginationMeta, Property, Unit } from '@/types';

export default function TenantsPage() {
  const { activeOrg } = useAuth();
  const { error, success } = useToast();

  const [items, setItems] = useState<TenantProfile[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [form, setForm] = useState({
    propertyId: '',
    unitId: '',
    tenantFullName: '',
    email: '',
    phone: '',
    proposedRentAmount: '',
    proposedDepositAmount: '',
    proposedStartDate: '',
    billingFrequency: 'MONTHLY',
    paymentDueDay: '5',
  });

  const load = useCallback(
    async (page = 1) => {
      if (!activeOrg) return;
      setLoading(true);
      try {
        const d = await api.getList<TenantProfile>(`/organizations/${activeOrg.id}/tenants`, {
          page,
          limit: 20,
          search: search || undefined,
        });
        setItems(d.items);
        setMeta(d.meta);
      } catch (e) {
        error(getErrorMessage(e));
      } finally {
        setLoading(false);
      }
    },
    [activeOrg, search, error],
  );

  useEffect(() => {
    load(1);
    if (activeOrg) {
      api
        .getList<Property>(`/organizations/${activeOrg.id}/properties`, { limit: 100 })
        .then((d) => setProperties(d.items))
        .catch(() => {});
    }
  }, [activeOrg, load]);

  const chooseProperty = async (propertyId: string) => {
    setForm((f) => ({ ...f, propertyId, unitId: '' }));
    if (activeOrg && propertyId) {
      const d = await api.getList<Unit>(
        `/organizations/${activeOrg.id}/properties/${propertyId}/units`,
        { limit: 100 },
      );
      setUnits(d.items);
    } else {
      setUnits([]);
    }
  };

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const invite = async () => {
    if (!activeOrg) return;
    setSaving(true);
    try {
      await api.post(`/organizations/${activeOrg.id}/tenant-invitations`, {
        propertyId: form.propertyId,
        unitId: form.unitId,
        tenantFullName: form.tenantFullName,
        email: form.email,
        phone: form.phone || undefined,
        proposedRentAmount: Number(form.proposedRentAmount),
        proposedDepositAmount: form.proposedDepositAmount
          ? Number(form.proposedDepositAmount)
          : undefined,
        proposedStartDate: form.proposedStartDate || undefined,
        billingFrequency: form.billingFrequency,
        paymentDueDay: form.paymentDueDay ? Number(form.paymentDueDay) : undefined,
      });
      success('Invitation sent to tenant');
      setInviteOpen(false);
      setForm({
        propertyId: '',
        unitId: '',
        tenantFullName: '',
        email: '',
        phone: '',
        proposedRentAmount: '',
        proposedDepositAmount: '',
        proposedStartDate: '',
        billingFrequency: 'MONTHLY',
        paymentDueDay: '5',
      });
      load(1);
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading && items.length === 0) return <PageLoader />;

  return (
    <div>
      <PageHeader
        title="Tenants"
        description="Tenant profiles across your portfolio"
        actions={
          <button className="btn-primary" onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" /> Invite tenant
          </button>
        }
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <input
            className="input pl-9"
            placeholder="Search tenants…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(1)}
          />
        </div>
      </div>

      {items.length === 0 && !loading ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No tenants yet"
          description="Invite a tenant by email. They'll receive a secure link to set up their account."
          action={
            <button className="btn-primary" onClick={() => setInviteOpen(true)}>
              <Mail className="h-4 w-4" /> Invite tenant
            </button>
          }
        />
      ) : (
        <>
          <DataTable<TenantProfile>
            columns={[
              {
                key: 'fullName',
                header: 'Tenant',
                render: (t) => (
                  <div>
                    <div className="font-medium text-ink-800">{t.fullName}</div>
                    <div className="text-xs text-ink-400">{t.email}</div>
                  </div>
                ),
              },
              {
                key: 'phone',
                header: 'Phone',
                render: (t) => <span className="text-ink-600">{t.phone || '—'}</span>,
              },
              {
                key: 'status',
                header: 'Status',
                render: (t) => <StatusBadge status={t.status} />,
              },
            ]}
            rows={items}
            keyField={(t) => t.id}
          />
          <Pagination meta={meta} onPageChange={(p) => load(p)} />
        </>
      )}

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a tenant"
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={invite}
              disabled={
                saving || !form.tenantFullName || !form.email || !form.propertyId || !form.unitId
              }
            >
              {saving ? 'Sending…' : 'Send invitation'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Full name *</label>
            <input
              className="input"
              value={form.tenantFullName}
              onChange={(e) => update('tenantFullName', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Email *</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Phone</label>
            <input
              className="input"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Property *</label>
            <select
              className="input"
              value={form.propertyId}
              onChange={(e) => chooseProperty(e.target.value)}
            >
              <option value="">Select property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Unit *</label>
            <select
              className="input"
              value={form.unitId}
              onChange={(e) => update('unitId', e.target.value)}
              disabled={!form.propertyId}
            >
              <option value="">Select unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unitNumber} ({u.unitType})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Billing frequency</label>
            <select
              className="input"
              value={form.billingFrequency}
              onChange={(e) => update('billingFrequency', e.target.value)}
            >
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="ANNUALLY">Annually</option>
            </select>
          </div>
          <div>
            <label className="label">Proposed rent (KSh) *</label>
            <input
              className="input"
              type="number"
              value={form.proposedRentAmount}
              onChange={(e) => update('proposedRentAmount', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Proposed deposit (KSh)</label>
            <input
              className="input"
              type="number"
              value={form.proposedDepositAmount}
              onChange={(e) => update('proposedDepositAmount', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Proposed start date</label>
            <input
              className="input"
              type="date"
              value={form.proposedStartDate}
              onChange={(e) => update('proposedStartDate', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Payment due day</label>
            <input
              className="input"
              type="number"
              min={1}
              max={28}
              value={form.paymentDueDay}
              onChange={(e) => update('paymentDueDay', e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
