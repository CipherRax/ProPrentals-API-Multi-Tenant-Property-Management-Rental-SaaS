'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Users, Search, Mail } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatMoney } from '@/lib/api';
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
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [form, setForm] = useState({
    propertyId: '',
    unitId: '',
    tenantFullName: '',
    email: '',
    phone: '',
    customRent: false,
    rentOverride: '',
    customDeposit: false,
    depositOverride: '',
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
    setForm((f) => ({
      ...f,
      propertyId,
      unitId: '',
      customRent: false,
      customDeposit: false,
      rentOverride: '',
      depositOverride: '',
    }));
    setSelectedUnit(null);
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

  const chooseUnit = (unitId: string) => {
    const u = units.find((x) => x.id === unitId) ?? null;
    setSelectedUnit(u);
    setForm((f) => ({
      ...f,
      unitId,
      customRent: false,
      customDeposit: false,
      rentOverride: '',
      depositOverride: '',
    }));
  };

  const update = (field: string, value: string) => setForm((f) => ({ ...f, [field]: value }));
  const updateBool = (field: string, value: boolean) => setForm((f) => ({ ...f, [field]: value }));

  const invite = async () => {
    if (!activeOrg) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        propertyId: form.propertyId,
        unitId: form.unitId,
        tenantFullName: form.tenantFullName,
        email: form.email,
        phone: form.phone || undefined,
        proposedStartDate: form.proposedStartDate || undefined,
        billingFrequency: form.billingFrequency,
        paymentDueDay: form.paymentDueDay ? Number(form.paymentDueDay) : undefined,
      };
      if (form.customRent && form.rentOverride) {
        payload.proposedRentAmount = Number(form.rentOverride);
        payload.customRent = true;
      }
      if (form.customDeposit && form.depositOverride) {
        payload.proposedDepositAmount = Number(form.depositOverride);
        payload.customDeposit = true;
      }
      await api.post(`/organizations/${activeOrg.id}/tenant-invitations`, payload);
      success(`Invitation sent to ${form.tenantFullName}.`);
      setInviteOpen(false);
      setForm({
        propertyId: '',
        unitId: '',
        tenantFullName: '',
        email: '',
        phone: '',
        customRent: false,
        rentOverride: '',
        customDeposit: false,
        depositOverride: '',
        proposedStartDate: '',
        billingFrequency: 'MONTHLY',
        paymentDueDay: '5',
      });
      setSelectedUnit(null);
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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-300" />
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
                    <div className="font-medium text-paper-800">{t.fullName}</div>
                    <div className="text-xs text-paper-400">{t.email}</div>
                  </div>
                ),
              },
              {
                key: 'phone',
                header: 'Phone',
                render: (t) => <span className="text-paper-600">{t.phone || '—'}</span>,
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
              onChange={(e) => chooseUnit(e.target.value)}
              disabled={!form.propertyId}
            >
              <option value="">Select unit</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.unitNumber} ({u.unitTypeDefinition?.typeName ?? 'Unspecified'})
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

          {/* Rent & deposit are inherited from the selected unit */}
          <div className="rounded-lg border border-paper-200 bg-paper-50/50 p-4 sm:col-span-2">
            {!selectedUnit ? (
              <p className="text-sm text-paper-400">
                Select a unit above to see its listed rent and deposit. The invitation inherits
                them automatically.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-paper-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-paper-400">
                        Monthly rent
                      </div>
                      <div className="mt-1 text-lg font-semibold text-paper-900">
                        {formatMoney(selectedUnit.baseRent)}
                      </div>
                      {selectedUnit.unitTypeDefinition && (
                        <div className="mt-0.5 text-xs text-paper-400">
                          {selectedUnit.unitTypeDefinition.typeName}
                        </div>
                      )}
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium text-paper-600">
                      <input
                        type="checkbox"
                        checked={form.customRent}
                        onChange={(e) => updateBool('customRent', e.target.checked)}
                        className="h-4 w-4 rounded border-paper-300 text-brand-700 focus:ring-brand-500"
                      />
                      Override
                    </label>
                  </div>
                  {form.customRent && (
                    <div className="mt-3">
                      <input
                        className="input w-full"
                        type="number"
                        min={0}
                        placeholder="Custom rent (KSh)"
                        value={form.rentOverride}
                        onChange={(e) => update('rentOverride', e.target.value)}
                      />
                      {form.rentOverride &&
                        Number(form.rentOverride) > 0 &&
                        Number(form.rentOverride) !== Number(selectedUnit.baseRent) && (
                          <p className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                            This differs from the unit&apos;s listed rent of{' '}
                            {formatMoney(selectedUnit.baseRent)}. The tenant will be offered the
                            custom rate and the lease will record it as a custom rate.
                          </p>
                        )}
                    </div>
                  )}
                </div>

                <div className="rounded-md border border-paper-200 bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-wide text-paper-400">
                        Deposit
                      </div>
                      <div className="mt-1 text-lg font-semibold text-paper-900">
                        {formatMoney(selectedUnit.depositAmount)}
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-medium text-paper-600">
                      <input
                        type="checkbox"
                        checked={form.customDeposit}
                        onChange={(e) => updateBool('customDeposit', e.target.checked)}
                        className="h-4 w-4 rounded border-paper-300 text-brand-700 focus:ring-brand-500"
                      />
                      Override
                    </label>
                  </div>
                  {form.customDeposit && (
                    <div className="mt-3">
                      <input
                        className="input w-full"
                        type="number"
                        min={0}
                        placeholder="Custom deposit (KSh)"
                        value={form.depositOverride}
                        onChange={(e) => update('depositOverride', e.target.value)}
                      />
                      {form.depositOverride &&
                        Number(form.depositOverride) > 0 &&
                        Number(form.depositOverride) !== Number(selectedUnit.depositAmount) && (
                          <p className="mt-1.5 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                            This differs from the unit&apos;s listed deposit of{' '}
                            {formatMoney(selectedUnit.depositAmount)}.
                          </p>
                        )}
                    </div>
                  )}
                </div>
              </div>
            )}
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
