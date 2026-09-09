'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Plus, Building2, DoorOpen, MapPin, Phone, Mail } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatMoney } from '@/lib/api';
import { PageLoader } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/lib/toast';
import type { Property, Building, Unit } from '@/types';

const unitTypes = [
  'APARTMENT',
  'BEDSITTER',
  'SINGLE_ROOM',
  'ONE_BEDROOM',
  'TWO_BEDROOM',
  'THREE_BEDROOM',
  'MAISONETTE',
  'HOUSE',
  'SHOP',
  'OFFICE',
  'PARKING_SPACE',
  'OTHER',
];

export default function PropertyDetailPage() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { activeOrg } = useAuth();
  const { error, success } = useToast();

  const [property, setProperty] = useState<Property | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [unitOpen, setUnitOpen] = useState(false);
  const [buildingOpen, setBuildingOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [unitForm, setUnitForm] = useState({
    buildingId: '',
    unitNumber: '',
    unitType: 'BEDSITTER',
    floor: '',
    bedrooms: '',
    bathrooms: '',
    sizeSqm: '',
    baseRent: '',
    depositAmount: '',
    isPubliclyListable: false,
  });
  const [buildingForm, setBuildingForm] = useState({
    name: '',
    buildingNumber: '',
    floors: '',
  });

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    try {
      const [p, b, u] = await Promise.all([
        api.get<Property>(`/organizations/${activeOrg.id}/properties/${propertyId}`),
        api.getList<Building>(`/organizations/${activeOrg.id}/properties/${propertyId}/buildings`, {
          limit: 100,
        }),
        api.getList<Unit>(`/organizations/${activeOrg.id}/properties/${propertyId}/units`, {
          limit: 100,
        }),
      ]);
      setProperty(p);
      setBuildings(b.items);
      setUnits(u.items);
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [activeOrg, propertyId, error]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, activeOrg?.id]);

  const uf_update = (field: string, value: string | boolean) =>
    setUnitForm((f) => ({ ...f, [field]: value }));

  const createUnit = async () => {
    if (!activeOrg) return;
    setSaving(true);
    try {
      await api.post(`/organizations/${activeOrg.id}/properties/${propertyId}/units`, {
        ...unitForm,
        buildingId: unitForm.buildingId || undefined,
        floor: unitForm.floor ? Number(unitForm.floor) : undefined,
        bedrooms: unitForm.bedrooms ? Number(unitForm.bedrooms) : undefined,
        bathrooms: unitForm.bathrooms ? Number(unitForm.bathrooms) : undefined,
        sizeSqm: unitForm.sizeSqm ? Number(unitForm.sizeSqm) : undefined,
        baseRent: Number(unitForm.baseRent),
        depositAmount: unitForm.depositAmount ? Number(unitForm.depositAmount) : undefined,
      });
      success('Unit created');
      setUnitOpen(false);
      setUnitForm({
        buildingId: '',
        unitNumber: '',
        unitType: 'BEDSITTER',
        floor: '',
        bedrooms: '',
        bathrooms: '',
        sizeSqm: '',
        baseRent: '',
        depositAmount: '',
        isPubliclyListable: false,
      });
      load();
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const createBuilding = async () => {
    if (!activeOrg) return;
    setSaving(true);
    try {
      await api.post(`/organizations/${activeOrg.id}/properties/${propertyId}/buildings`, {
        ...buildingForm,
        floors: buildingForm.floors ? Number(buildingForm.floors) : undefined,
      });
      success('Building created');
      setBuildingOpen(false);
      setBuildingForm({ name: '', buildingNumber: '', floors: '' });
      load();
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading && !property) return <PageLoader />;
  if (!property) return null;

  const currency = activeOrg?.currency ?? 'KES';

  return (
    <div>
      <Link
        href="/properties"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-paper-500 hover:text-paper-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to properties
      </Link>

      <div className="surface mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-paper-900">{property.name}</h1>
              <StatusBadge status={property.status} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-paper-500">
              <span className="capitalize">
                {property.propertyType.toLowerCase().replace(/_/g, ' ')}
              </span>
              {property.city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {property.city}
                  {property.county ? `, ${property.county}` : ''}
                </span>
              )}
              {property.contactPhone && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3.5 w-3.5" /> {property.contactPhone}
                </span>
              )}
              {property.contactEmail && (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3.5 w-3.5" /> {property.contactEmail}
                </span>
              )}
            </div>
            {property.description && (
              <p className="mt-3 max-w-2xl text-sm text-paper-500">{property.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setBuildingOpen(true)}>
              <Building2 className="h-4 w-4" /> Building
            </button>
            <button className="btn-primary" onClick={() => setUnitOpen(true)}>
              <Plus className="h-4 w-4" /> Unit
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-paper-800">Buildings</h2>
          {buildings.length === 0 ? (
            <div className="surface px-5 py-8 text-center text-sm text-paper-400">
              No buildings added yet.
            </div>
          ) : (
            <div className="space-y-3">
              {buildings.map((b) => (
                <div key={b.id} className="surface flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-paper-100 text-paper-500">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-paper-800">{b.name}</div>
                      <div className="text-xs text-paper-400">
                        {b.floors ? `${b.floors} floors` : '—'} · {b._count?.units ?? 0} units
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-paper-800">Units</h2>
          {units.length === 0 ? (
            <div className="surface px-5 py-8 text-center text-sm text-paper-400">
              No units yet. Add your first unit.
            </div>
          ) : (
            <div className="space-y-3">
              {units.map((u) => (
                <div key={u.id} className="surface flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                      <DoorOpen className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-paper-800">
                        {u.unitNumber}{' '}
                        <span className="text-xs font-normal capitalize text-paper-400">
                          · {u.unitType.toLowerCase().replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="text-xs text-paper-400">
                        {u.bedrooms ? `${u.bedrooms} bd · ` : ''}
                        {formatMoney(u.baseRent, currency)}/mo
                      </div>
                    </div>
                  </div>
                  <StatusBadge status={u.availabilityStatus} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Modal
        open={unitOpen}
        onClose={() => setUnitOpen(false)}
        title="Add unit"
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setUnitOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={createUnit}
              disabled={saving || !unitForm.unitNumber || !unitForm.baseRent}
            >
              {saving ? 'Creating…' : 'Create unit'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Building</label>
            <select
              className="input"
              value={unitForm.buildingId}
              onChange={(e) => uf_update('buildingId', e.target.value)}
            >
              <option value="">None</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Unit number *</label>
            <input
              className="input"
              value={unitForm.unitNumber}
              onChange={(e) => uf_update('unitNumber', e.target.value)}
              placeholder="e.g. B2"
            />
          </div>
          <div>
            <label className="label">Type</label>
            <select
              className="input"
              value={unitForm.unitType}
              onChange={(e) => uf_update('unitType', e.target.value)}
            >
              {unitTypes.map((t) => (
                <option key={t} value={t}>
                  {t.toLowerCase().replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Floor</label>
            <input
              className="input"
              type="number"
              value={unitForm.floor}
              onChange={(e) => uf_update('floor', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Bedrooms</label>
            <input
              className="input"
              type="number"
              value={unitForm.bedrooms}
              onChange={(e) => uf_update('bedrooms', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Bathrooms</label>
            <input
              className="input"
              type="number"
              value={unitForm.bathrooms}
              onChange={(e) => uf_update('bathrooms', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Size (sqm)</label>
            <input
              className="input"
              type="number"
              value={unitForm.sizeSqm}
              onChange={(e) => uf_update('sizeSqm', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Monthly rent (KSh) *</label>
            <input
              className="input"
              type="number"
              value={unitForm.baseRent}
              onChange={(e) => uf_update('baseRent', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Deposit (KSh)</label>
            <input
              className="input"
              type="number"
              value={unitForm.depositAmount}
              onChange={(e) => uf_update('depositAmount', e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-paper-600 sm:col-span-2">
            <input
              type="checkbox"
              checked={unitForm.isPubliclyListable}
              onChange={(e) => uf_update('isPubliclyListable', e.target.checked)}
              className="h-4 w-4 rounded border-paper-300 text-brand-700 focus:ring-brand-500"
            />
            List in public marketplace
          </label>
        </div>
      </Modal>

      <Modal
        open={buildingOpen}
        onClose={() => setBuildingOpen(false)}
        title="Add building"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setBuildingOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={createBuilding}
              disabled={saving || !buildingForm.name}
            >
              {saving ? 'Creating…' : 'Create building'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Name *</label>
            <input
              className="input"
              value={buildingForm.name}
              onChange={(e) => setBuildingForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Block A"
            />
          </div>
          <div>
            <label className="label">Building number</label>
            <input
              className="input"
              value={buildingForm.buildingNumber}
              onChange={(e) => setBuildingForm((f) => ({ ...f, buildingNumber: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Floors</label>
            <input
              className="input"
              type="number"
              value={buildingForm.floors}
              onChange={(e) => setBuildingForm((f) => ({ ...f, floors: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
