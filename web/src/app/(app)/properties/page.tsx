'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Building2, Search } from 'lucide-react';
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
import type { Property, PaginationMeta } from '@/types';

const propertyTypes = [
  'APARTMENT_COMPLEX',
  'RESIDENTIAL_BUILDING',
  'HOUSE',
  'COMMERCIAL',
  'MIXED_USE',
  'STUDENT_HOUSING',
  'OTHER',
];

export default function PropertiesPage() {
  const router = useRouter();
  const { activeOrg } = useAuth();
  const { error, success } = useToast();
  const [items, setItems] = useState<Property[]>([]);
  const [meta, setMeta] = useState<PaginationMeta>();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    propertyType: 'APARTMENT_COMPLEX',
    description: '',
    city: '',
    county: '',
    neighborhood: '',
    addressLine: '',
    contactPhone: '',
    contactEmail: '',
    isPubliclyListable: false,
  });

  const load = useCallback(
    async (page = 1) => {
      if (!activeOrg) return;
      setLoading(true);
      try {
        const d = await api.getList<Property>(`/organizations/${activeOrg.id}/properties`, {
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
  }, [load]);

  const update = (field: string, value: string | boolean) =>
    setForm((f) => ({ ...f, [field]: value }));

  const create = async () => {
    if (!activeOrg) return;
    setSaving(true);
    try {
      await api.post<Property>(`/organizations/${activeOrg.id}/properties`, form);
      success('Property created');
      setCreateOpen(false);
      setForm({
        name: '',
        propertyType: 'APARTMENT_COMPLEX',
        description: '',
        city: '',
        county: '',
        neighborhood: '',
        addressLine: '',
        contactPhone: '',
        contactEmail: '',
        isPubliclyListable: false,
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
        title="Properties"
        description="Your portfolio of buildings, houses, and units"
        actions={
          <button className="btn-primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New property
          </button>
        }
      />

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
          <input
            className="input pl-9"
            placeholder="Search properties…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load(1)}
          />
        </div>
      </div>

      {items.length === 0 && !loading ? (
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title="No properties yet"
          description="Add your first property to start managing units and tenants."
          action={
            <button className="btn-primary" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Add property
            </button>
          }
        />
      ) : (
        <>
          <DataTable<Property>
            columns={[
              {
                key: 'name',
                header: 'Name',
                render: (p) => (
                  <div>
                    <div className="font-medium text-ink-800">{p.name}</div>
                    <div className="text-xs text-ink-400">
                      {p.city || p.county || '—'} · {p._count?.units ?? 0} units
                    </div>
                  </div>
                ),
              },
              {
                key: 'propertyType',
                header: 'Type',
                render: (p) => (
                  <span className="capitalize text-ink-600">
                    {p.propertyType.toLowerCase().replace(/_/g, ' ')}
                  </span>
                ),
              },
              {
                key: 'status',
                header: 'Status',
                render: (p) => <StatusBadge status={p.status} />,
              },
              {
                key: 'verificationStatus',
                header: 'Verification',
                render: (p) => <StatusBadge status={p.verificationStatus} />,
              },
            ]}
            rows={items}
            keyField={(p) => p.id}
            onRowClick={(p) => router.push(`/properties/${p.id}`)}
          />
          <Pagination meta={meta} onPageChange={(p) => load(p)} />
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New property"
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={create} disabled={saving || !form.name}>
              {saving ? 'Creating…' : 'Create property'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">Name *</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => update('name', e.target.value)}
              placeholder="e.g. Sunview Apartments"
            />
          </div>
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={form.propertyType}
              onChange={(e) => update('propertyType', e.target.value)}
            >
              {propertyTypes.map((t) => (
                <option key={t} value={t}>
                  {t.toLowerCase().replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">City</label>
            <input
              className="input"
              value={form.city}
              onChange={(e) => update('city', e.target.value)}
            />
          </div>
          <div>
            <label className="label">County</label>
            <input
              className="input"
              value={form.county}
              onChange={(e) => update('county', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Neighborhood</label>
            <input
              className="input"
              value={form.neighborhood}
              onChange={(e) => update('neighborhood', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <input
              className="input"
              value={form.addressLine}
              onChange={(e) => update('addressLine', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Contact phone</label>
            <input
              className="input"
              value={form.contactPhone}
              onChange={(e) => update('contactPhone', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Contact email</label>
            <input
              className="input"
              value={form.contactEmail}
              onChange={(e) => update('contactEmail', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Description</label>
            <textarea
              className="input h-24"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-600 sm:col-span-2">
            <input
              type="checkbox"
              checked={form.isPubliclyListable}
              onChange={(e) => update('isPubliclyListable', e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-brand-700 focus:ring-brand-500"
            />
            Show in public marketplace
          </label>
        </div>
      </Modal>
    </div>
  );
}
