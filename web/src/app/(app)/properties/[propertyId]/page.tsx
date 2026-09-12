'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Plus,
  Building2,
  DoorOpen,
  MapPin,
  Phone,
  Mail,
  Store,
  ImagePlus,
  Camera,
  Trash2,
  Layers,
  Minus,
  Pencil,
} from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, formatMoney, resolveAssetUrl } from '@/lib/api';
import { can } from '@/lib/rbac';
import { PageLoader } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/lib/toast';
import type { Property, Building, Unit, UnitTypeDefinition } from '@/types';

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
  'BUNGALOW',
  'STUDIO',
  'OTHER',
];

const furnishedOptions = ['UNFURNISHED', 'SEMI_FURNISHED', 'FULLY_FURNISHED'];

const waterOptions = ['BOREHOLE', 'PIPED', 'TWENTY_FOUR_HOUR', 'NONE'];

const splitList = (value: string) =>
  value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const joinList = (list?: string[]) => (list ?? []).map((v) => v.trim()).filter(Boolean).join(', ');

export default function PropertyDetailPage() {
  const { propertyId } = useParams<{ propertyId: string }>();
  const { activeOrg } = useAuth();
  const { error, success } = useToast();
  const canManage =
    can(activeOrg?.myRole, 'property:create') ||
    can(activeOrg?.myRole, 'property:update') ||
    can(activeOrg?.myRole, 'property:delete');

  const [property, setProperty] = useState<Property | null>(null);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [unitTypeDefs, setUnitTypeDefs] = useState<UnitTypeDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [unitOpen, setUnitOpen] = useState(false);
  const [buildingOpen, setBuildingOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [editingType, setEditingType] = useState<UnitTypeDefinition | null>(null);
  const [saving, setSaving] = useState(false);
  const [stepperBusy, setStepperBusy] = useState<string | null>(null);
  const [typeToggling, setTypeToggling] = useState<string | null>(null);

  const [typeForm, setTypeForm] = useState({
    typeName: '',
    baseRent: '',
    depositAmount: '',
    bedrooms: '',
    bathrooms: '',
    sizeSqm: '',
    unitType: 'OTHER',
    furnishedStatus: '',
    parkingAvailable: false,
    parkingSpaces: '',
    waterAvailability: '',
    petFriendly: false,
    securityFeatures: '',
    proximityTags: '',
    utilitiesIncluded: '',
    availableFrom: '',
    trackingMode: 'AUTO' as 'AUTO' | 'MANUAL',
    totalCount: '',
    vacantCount: '',
    description: '',
    isPubliclyListable: true,
  });

  const [unitForm, setUnitForm] = useState({
    buildingId: '',
    unitNumber: '',
    unitTypeName: 'BEDSITTER',
    floor: '',
    bedrooms: '',
    bathrooms: '',
    sizeSqm: '',
    baseRent: '',
    depositAmount: '',
    unitType: 'OTHER',
    furnishedStatus: '',
    parkingAvailable: false,
    parkingSpaces: '',
    waterAvailability: '',
    petFriendly: false,
    securityFeatures: '',
    proximityTags: '',
    utilitiesIncluded: '',
    availableFrom: '',
    isPubliclyListable: false,
  });
  const [buildingForm, setBuildingForm] = useState({
    name: '',
    buildingNumber: '',
    floors: '',
  });
  const [toggling, setToggling] = useState<string | null>(null);
  const propertyPhotoRef = useRef<HTMLInputElement>(null);
  const unitPhotoRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [photoTargetUnit, setPhotoTargetUnit] = useState<string | null>(null);
  const [photoTarget, setPhotoTarget] = useState<string>('property');

  const load = useCallback(async () => {
    if (!activeOrg) return;
    setLoading(true);
    try {
      const [p, b, u, t] = await Promise.all([
        api.get<Property>(`/organizations/${activeOrg.id}/properties/${propertyId}`),
        api.getList<Building>(`/organizations/${activeOrg.id}/properties/${propertyId}/buildings`, {
          limit: 100,
        }),
        api.getList<Unit>(`/organizations/${activeOrg.id}/properties/${propertyId}/units`, {
          limit: 100,
        }),
        api.getList<UnitTypeDefinition>(
          `/organizations/${activeOrg.id}/properties/${propertyId}/unit-types`,
          { limit: 100 },
        ),
      ]);
      setProperty(p);
      setBuildings(b.items);
      setUnits(u.items);
      setUnitTypeDefs(t.items);
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
        unitType: (unitForm.unitType || 'OTHER') as typeof unitTypes[number],
        furnishedStatus: unitForm.furnishedStatus || undefined,
        parkingAvailable: unitForm.parkingAvailable,
        parkingSpaces: unitForm.parkingSpaces ? Number(unitForm.parkingSpaces) : undefined,
        waterAvailability: unitForm.waterAvailability || undefined,
        petFriendly: unitForm.petFriendly,
        securityFeatures: splitList(unitForm.securityFeatures),
        proximityTags: splitList(unitForm.proximityTags),
        utilitiesIncluded: splitList(unitForm.utilitiesIncluded),
        availableFrom: unitForm.availableFrom || undefined,
      });
      success(`Unit ${unitForm.unitNumber} added to ${property?.name ?? 'this property'}.`);
      setUnitOpen(false);
      setUnitForm({
        buildingId: '',
        unitNumber: '',
        unitTypeName: 'BEDSITTER',
        floor: '',
        bedrooms: '',
        bathrooms: '',
        sizeSqm: '',
        baseRent: '',
        depositAmount: '',
        unitType: 'OTHER',
        furnishedStatus: '',
        parkingAvailable: false,
        parkingSpaces: '',
        waterAvailability: '',
        petFriendly: false,
        securityFeatures: '',
        proximityTags: '',
        utilitiesIncluded: '',
        availableFrom: '',
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
      success(`Building "${buildingForm.name}" added.`);
      setBuildingOpen(false);
      setBuildingForm({ name: '', buildingNumber: '', floors: '' });
      load();
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleMarketplace = async (unitId: string, nextListable: boolean) => {
    if (!activeOrg) return;
    setToggling(unitId);
    try {
      // Listing a unit on the marketplace also requires the property to be
      // publicly listable — enable it automatically so the action "just works".
      if (nextListable && !property?.isPubliclyListable) {
        await api.patch(
          `/organizations/${activeOrg.id}/properties/${propertyId}`,
          { isPubliclyListable: true },
        );
      }
      await api.patch(
        `/organizations/${activeOrg.id}/properties/${propertyId}/units/${unitId}`,
        { isPubliclyListable: nextListable },
      );
      success(nextListable ? 'Added to marketplace' : 'Removed from marketplace');
      load();
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setToggling(null);
    }
  };

  const togglePropertyMarketplace = async () => {
    if (!activeOrg) return;
    setToggling('property');
    try {
      await api.patch(
        `/organizations/${activeOrg.id}/properties/${propertyId}`,
        { isPubliclyListable: !property?.isPubliclyListable },
      );
      success(
        property?.isPubliclyListable
          ? 'Property removed from marketplace'
          : 'Property listed in marketplace',
      );
      load();
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setToggling(null);
    }
  };

  const openTypeModal = (t?: UnitTypeDefinition) => {
    if (!activeOrg) return;
    if (t) {
      setEditingType(t);
      setTypeForm({
        typeName: t.typeName,
        baseRent: t.baseRent ?? '',
        depositAmount: t.depositAmount ?? '',
        bedrooms: t.bedrooms != null ? String(t.bedrooms) : '',
        bathrooms: t.bathrooms != null ? String(t.bathrooms) : '',
        sizeSqm: t.sizeSqm != null ? String(t.sizeSqm) : '',
        unitType: t.unitType ?? 'OTHER',
        furnishedStatus: t.furnishedStatus ?? '',
        parkingAvailable: t.parkingAvailable ?? false,
        parkingSpaces: t.parkingSpaces != null ? String(t.parkingSpaces) : '',
        waterAvailability: t.waterAvailability ?? '',
        petFriendly: t.petFriendly ?? false,
        securityFeatures: joinList(t.securityFeatures),
        proximityTags: joinList(t.proximityTags),
        utilitiesIncluded: joinList(t.utilitiesIncluded),
        availableFrom: t.availableFrom ? String(t.availableFrom).slice(0, 10) : '',
        trackingMode: t.trackingMode ?? 'AUTO',
        totalCount: t.totalCount != null ? String(t.totalCount) : '',
        vacantCount: t.vacantCount != null ? String(t.vacantCount) : '',
        description: t.description ?? '',
        isPubliclyListable: t.isPubliclyListable ?? true,
      });
    } else {
      setEditingType(null);
      setTypeForm({
        typeName: '',
        baseRent: '',
        depositAmount: '',
        bedrooms: '',
        bathrooms: '',
        sizeSqm: '',
        unitType: 'OTHER',
        furnishedStatus: '',
        parkingAvailable: false,
        parkingSpaces: '',
        waterAvailability: '',
        petFriendly: false,
        securityFeatures: '',
        proximityTags: '',
        utilitiesIncluded: '',
        availableFrom: '',
        trackingMode: 'AUTO',
        totalCount: '',
        vacantCount: '',
        description: '',
        isPubliclyListable: true,
      });
    }
    setTypeOpen(true);
  };

  const saveUnitType = async () => {
    if (!activeOrg) return;
    setSaving(true);
    try {
      const payload = {
        typeName: typeForm.typeName,
        baseRent: Number(typeForm.baseRent),
        depositAmount: Number(typeForm.depositAmount),
        bedrooms: typeForm.bedrooms ? Number(typeForm.bedrooms) : undefined,
        bathrooms: typeForm.bathrooms ? Number(typeForm.bathrooms) : undefined,
        sizeSqm: typeForm.sizeSqm ? Number(typeForm.sizeSqm) : undefined,
        unitType: (typeForm.unitType || 'OTHER') as typeof unitTypes[number],
        furnishedStatus: typeForm.furnishedStatus || undefined,
        parkingAvailable: typeForm.parkingAvailable,
        parkingSpaces: typeForm.parkingSpaces ? Number(typeForm.parkingSpaces) : undefined,
        waterAvailability: typeForm.waterAvailability || undefined,
        petFriendly: typeForm.petFriendly,
        securityFeatures: splitList(typeForm.securityFeatures),
        proximityTags: splitList(typeForm.proximityTags),
        utilitiesIncluded: splitList(typeForm.utilitiesIncluded),
        availableFrom: typeForm.availableFrom || undefined,
        description: typeForm.description || undefined,
        isPubliclyListable: typeForm.isPubliclyListable,
        trackingMode: typeForm.trackingMode,
        ...(typeForm.trackingMode === 'MANUAL'
          ? {
              totalCount: typeForm.totalCount ? Number(typeForm.totalCount) : 0,
              vacantCount: typeForm.vacantCount ? Number(typeForm.vacantCount) : 0,
            }
          : {}),
      };
      if (editingType) {
        await api.patch(
          `/organizations/${activeOrg.id}/properties/${propertyId}/unit-types/${editingType.id}`,
          payload,
        );
        success(`Unit type "${typeForm.typeName}" updated.`);
      } else {
        await api.post(
          `/organizations/${activeOrg.id}/properties/${propertyId}/unit-types`,
          payload,
        );
        success(`Unit type "${typeForm.typeName}" created.`);
      }
      setTypeOpen(false);
      setEditingType(null);
      load();
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const stepVacancy = async (t: UnitTypeDefinition, delta: number) => {
    if (!activeOrg) return;
    setStepperBusy(t.id);
    try {
      await api.post(
        `/organizations/${activeOrg.id}/properties/${propertyId}/unit-types/${t.id}/vacancy`,
        { delta },
      );
      load();
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setStepperBusy(null);
    }
  };

  const toggleTypeMarketplace = async (t: UnitTypeDefinition, next: boolean) => {
    if (!activeOrg) return;
    setTypeToggling(t.id);
    try {
      if (next && !property?.isPubliclyListable) {
        await api.patch(`/organizations/${activeOrg.id}/properties/${propertyId}`, {
          isPubliclyListable: true,
        });
      }
      await api.patch(
        `/organizations/${activeOrg.id}/properties/${propertyId}/unit-types/${t.id}`,
        { isPubliclyListable: next },
      );
      success(next ? 'Unit type listed in marketplace' : 'Unit type removed from marketplace');
      load();
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setTypeToggling(null);
    }
  };

  const uploadPhase = (files: File[], unitId?: string) => {
    if (!activeOrg || !files.length) return;
    setUploading(unitId ?? 'property');
    return api
      .upload<{ id: string; url: string }[]>(
        unitId
          ? `/organizations/${activeOrg.id}/properties/${propertyId}/units/${unitId}/images/upload`
          : `/organizations/${activeOrg.id}/properties/${propertyId}/images/upload`,
        files,
      )
      .then(() => {
        success(
          files.length === 1
            ? 'Photo added'
            : `${files.length} photos added`,
        );
        load();
      })
      .catch((e) => error(getErrorMessage(e)))
      .finally(() => setUploading(null));
  };

  const removePropertyImage = async (imageId: string) => {
    if (!activeOrg) return;
    try {
      await api.delete(
        `/organizations/${activeOrg.id}/properties/${propertyId}/images/${imageId}`,
      );
      success('Photo removed');
      load();
    } catch (e) {
      error(getErrorMessage(e));
    }
  };

  const removeUnitImage = async (unitId: string, imageId: string) => {
    if (!activeOrg) return;
    try {
      await api.delete(
        `/organizations/${activeOrg.id}/properties/${propertyId}/units/${unitId}/images/${imageId}`,
      );
      success('Photo removed');
      load();
    } catch (e) {
      error(getErrorMessage(e));
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
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <>
                <button
                  type="button"
                  onClick={togglePropertyMarketplace}
                  disabled={toggling === 'property'}
                  title={
                    property.isPubliclyListable
                      ? 'Stop showing units of this property on the public marketplace'
                      : 'Show units of this property on the public marketplace'
                  }
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    property.isPubliclyListable
                      ? 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100'
                      : 'border-paper-200 bg-white text-paper-500 hover:border-brand-300 hover:text-brand-700'
                  } ${toggling === 'property' ? 'opacity-60' : ''}`}
                >
                  <Store className="h-4 w-4" />
                  {toggling === 'property'
                    ? '…'
                    : property.isPubliclyListable
                      ? 'Property on marketplace'
                      : 'List property in marketplace'}
                </button>
                <button className="btn-secondary" onClick={() => setBuildingOpen(true)}>
                  <Building2 className="h-4 w-4" /> Add building
                </button>
                <button className="btn-primary" onClick={() => setUnitOpen(true)}>
                  <Plus className="h-4 w-4" /> Add unit
                </button>
              </>
            )}
          </div>
        </div>
        {!property.isPubliclyListable && (
          <p className="mt-4 flex items-start gap-2 rounded-panel border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Store className="mt-0.5 h-4 w-4 shrink-0" />
            This property is not listed in the public marketplace, so its units won&apos;t be
            visible there. Click “List property in marketplace” above (or mark any unit — that
            lists the property automatically).
          </p>
        )}
      </div>

      <section className="surface mb-6 p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-paper-800">Photos</h2>
          {canManage && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="input w-auto min-w-[200px]"
                value={photoTarget}
                onChange={(e) => setPhotoTarget(e.target.value)}
                title="Choose which unit the new photos belong to"
              >
                <option value="property">Property (when a unit has no photos)</option>
                {units.map((un) => (
                  <option key={un.id} value={un.id}>
                    Unit {un.unitNumber}
                  </option>
                ))}
              </select>
              <input
                ref={propertyPhotoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                multiple
                hidden
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  uploadPhase(files, photoTarget === 'property' ? undefined : photoTarget);
                }}
              />
              <button
                type="button"
                className="btn-secondary"
                onClick={() => propertyPhotoRef.current?.click()}
                disabled={uploading !== null}
              >
                <ImagePlus className="h-4 w-4" />
                {uploading !== null ? 'Uploading…' : 'Add photos'}
              </button>
            </div>
          )}
        </div>
        {units.some((un) => (un.images?.length ?? 0) > 0) ||
        (property.images?.length ?? 0) > 0 ? (
          <div className="space-y-5">
            {units
              .filter((un) => (un.images?.length ?? 0) > 0)
              .map((un) => (
                <div key={un.id}>
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium capitalize text-paper-500">
                    <DoorOpen className="h-3.5 w-3.5 text-brand-700" />
                    Unit {un.unitNumber}
                    <span className="rounded-full bg-paper-100 px-1.5 py-0.5 text-[10px]">
                      {un.images?.length ?? 0}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                    {(un.images ?? []).map((img) => (
                      <div
                        key={img.id}
                        className="group relative aspect-video overflow-hidden rounded-lg border border-paper-200"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={resolveAssetUrl(img.url)}
                          alt={`Unit ${un.unitNumber}`}
                          className="h-full w-full object-cover"
                        />
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => removeUnitImage(un.id, img.id)}
                            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                            title="Remove photo"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            {(property.images?.length ?? 0) > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-paper-500">
                  <Camera className="h-3.5 w-3.5 text-paper-400" />
                  Property photos
                  <span className="text-[10px] font-normal text-paper-400">
                    (shown in the marketplace only when a unit has no photos of its own)
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
                  {(property.images ?? []).map((img) => (
                    <div
                      key={img.id}
                      className="group relative aspect-video overflow-hidden rounded-lg border border-paper-200"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolveAssetUrl(img.url)}
                        alt={property.name}
                        className="h-full w-full object-cover"
                      />
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => removePropertyImage(img.id)}
                          className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                          title="Remove photo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-paper-300 px-6 py-10 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-paper-100 text-paper-400">
              <Camera className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-medium text-paper-600">No photos yet</p>
            <p className="mt-1 max-w-md text-xs text-paper-400">
              Pick a unit above and add photos, so it stands out in the marketplace with its
              own pictures.
            </p>
          </div>
        )}
      </section>

      <section className="surface mb-6 p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-paper-800">Unit types</h2>
            <p className="mt-0.5 text-xs text-paper-400">
              Each type becomes one card in the public marketplace. Add filterable attributes so
              tenants can find your listing.
            </p>
          </div>
          {canManage && (
            <button className="btn-secondary" onClick={() => openTypeModal()}>
              <Layers className="h-4 w-4" /> Add unit type
            </button>
          )}
        </div>
        {unitTypeDefs.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-paper-300 px-5 py-8 text-center text-sm text-paper-400">
            No unit types yet. Add one to group identical units and surface them on the marketplace.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {unitTypeDefs.map((t) => (
              <div key={t.id} className="rounded-lg border border-paper-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium text-paper-800">
                      {t.typeName}
                      {t.unitType && t.unitType !== 'OTHER' && (
                        <span className="rounded-full bg-paper-100 px-2 py-0.5 text-[10px] font-normal capitalize text-paper-500">
                          {t.unitType.toLowerCase().replace(/_/g, ' ')}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-paper-400">
                      {formatMoney(t.baseRent ?? 0, currency)}/mo · {t.bedrooms ? `${t.bedrooms} bd` : '—'}{' '}
                      · {t.totalCount ?? 0} total / {t.vacantCount ?? 0} vacant
                    </div>
                    {(t.furnishedStatus || t.waterAvailability || t.parkingAvailable || t.petFriendly) && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {t.furnishedStatus && (
                          <span className="rounded-full border border-paper-200 px-2 py-0.5 text-[10px] text-paper-500">
                            {t.furnishedStatus.toLowerCase().replace(/_/g, ' ')}
                          </span>
                        )}
                        {t.waterAvailability && t.waterAvailability !== 'NONE' && (
                          <span className="rounded-full border border-paper-200 px-2 py-0.5 text-[10px] text-paper-500">
                            {t.waterAvailability.toLowerCase().replace(/_/g, ' ')} water
                          </span>
                        )}
                        {t.parkingAvailable && (
                          <span className="rounded-full border border-paper-200 px-2 py-0.5 text-[10px] text-paper-500">
                            parking
                          </span>
                        )}
                        {t.petFriendly && (
                          <span className="rounded-full border border-paper-200 px-2 py-0.5 text-[10px] text-paper-500">
                            pets ok
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      t.trackingMode === 'AUTO'
                        ? 'bg-sky-50 text-sky-700'
                        : 'bg-amber-50 text-amber-700'
                    }`}
                  >
                    {t.trackingMode}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  {canManage && (
                    <>
                      <button
                        type="button"
                        onClick={() => openTypeModal(t)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-paper-200 bg-white px-3 py-1 text-xs font-medium text-paper-500 transition hover:border-brand-300 hover:text-brand-700"
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      {t.trackingMode === 'MANUAL' && (
                        <div className="inline-flex items-center gap-1 rounded-full border border-paper-200 px-1 py-1">
                          <button
                            type="button"
                            onClick={() => stepVacancy(t, -1)}
                            disabled={stepperBusy === t.id || (t.vacantCount ?? 0) <= 0}
                            className="rounded-full p-1 text-paper-500 transition hover:bg-paper-100 disabled:opacity-40"
                            title="Decrease vacancy"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="text-xs font-medium text-paper-600">
                            {stepperBusy === t.id ? '…' : `${t.vacantCount ?? 0} vac`}
                          </span>
                          <button
                            type="button"
                            onClick={() => stepVacancy(t, 1)}
                            disabled={stepperBusy === t.id || (t.vacantCount ?? 0) >= (t.totalCount ?? 0)}
                            className="rounded-full p-1 text-paper-500 transition hover:bg-paper-100 disabled:opacity-40"
                            title="Increase vacancy"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleTypeMarketplace(t, !t.isPubliclyListable)}
                        disabled={typeToggling === t.id}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                          t.isPubliclyListable
                            ? 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100'
                            : 'border-paper-200 bg-white text-paper-500 hover:border-brand-300 hover:text-brand-700'
                        } ${typeToggling === t.id ? 'opacity-60' : ''}`}
                      >
                        <Store className="h-3.5 w-3.5" />
                        {typeToggling === t.id
                          ? '…'
                          : t.isPubliclyListable
                            ? 'On marketplace'
                            : 'Add to marketplace'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-paper-800">Buildings</h2>
          {buildings.length === 0 ? (
            <div className="surface px-5 py-8 text-center text-sm text-paper-400">
              No buildings added yet. Add a building to organise units by block or tower.
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
              No units yet. Add your first unit to start tracking rent and tenancies.
            </div>
          ) : (
            <div className="space-y-3">
              {units.map((u) => (
                <div key={u.id} className="surface flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                      <DoorOpen className="h-4 w-4" />
                      {u.images?.length ? (
                        <span className="absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-paper-800 px-1 text-[9px] font-semibold text-white">
                          {u.images.length}
                        </span>
                      ) : null}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-paper-800">
                        {u.unitNumber}{' '}
                        <span className="text-xs font-normal capitalize text-paper-400">
                          · {(u.unitTypeDefinition?.typeName ?? 'Unspecified').toLowerCase().replace(/_/g, ' ')}
                        </span>
                      </div>
                      <div className="text-xs text-paper-400">
                        {u.bedrooms ? `${u.bedrooms} bd · ` : ''}
                        {formatMoney(u.baseRent, currency)}/mo
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      ref={unitPhotoRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                      multiple
                      hidden
                      onChange={(e) => {
                        const target = photoTargetUnit;
                        const files = Array.from(e.target.files ?? []);
                        e.target.value = '';
                        setPhotoTargetUnit(null);
                        if (target) uploadPhase(files, target);
                      }}
                    />
                    <button
                      type="button"
                      disabled={uploading === u.id}
                      title={
                        u.images?.length
                          ? `Upload photos (${u.images.length} on this unit)`
                          : 'Upload photos for this unit'
                      }
                      onClick={() => {
                        setPhotoTargetUnit(u.id);
                        unitPhotoRef.current?.click();
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-paper-200 bg-white p-1.5 text-xs font-medium text-paper-500 transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-50"
                    >
                      {uploading === u.id ? (
                        <span className="flex h-4 w-4 items-center justify-center">
                          <span className="h-2 w-2 animate-ping rounded-full bg-brand-500" />
                        </span>
                      ) : (
                        <Camera className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleMarketplace(u.id, !u.isPubliclyListable)}
                      disabled={toggling === u.id}
                      title={
                        u.isPubliclyListable
                          ? 'Remove from public marketplace'
                          : 'Add to public marketplace'
                      }
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${
                        u.isPubliclyListable
                          ? 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100'
                          : 'border-paper-200 bg-white text-paper-500 hover:border-brand-300 hover:text-brand-700'
                      } ${toggling === u.id ? 'opacity-60' : ''}`}
                    >
                      <Store className="h-3.5 w-3.5" />
                      {toggling === u.id
                        ? '…'
                        : u.isPubliclyListable
                          ? 'On marketplace'
                          : 'Add to marketplace'}
                    </button>
                    <StatusBadge status={u.availabilityStatus} />
                  </div>
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
              value={unitForm.unitTypeName}
              onChange={(e) => uf_update('unitTypeName', e.target.value)}
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
          <div>
            <label className="label">Unit type</label>
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
            <label className="label">Furnishing</label>
            <select
              className="input"
              value={unitForm.furnishedStatus}
              onChange={(e) => uf_update('furnishedStatus', e.target.value)}
            >
              <option value="">Not set</option>
              {furnishedOptions.map((f) => (
                <option key={f} value={f}>
                  {f.toLowerCase().replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Water</label>
            <select
              className="input"
              value={unitForm.waterAvailability}
              onChange={(e) => uf_update('waterAvailability', e.target.value)}
            >
              <option value="">Not set</option>
              {waterOptions.map((w) => (
                <option key={w} value={w}>
                  {w.toLowerCase().replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Parking spaces</label>
            <input
              className="input"
              type="number"
              value={unitForm.parkingSpaces}
              onChange={(e) => uf_update('parkingSpaces', e.target.value)}
              placeholder="e.g. 1"
            />
          </div>
          <div>
            <label className="label">Available from</label>
            <input
              className="input"
              type="date"
              value={unitForm.availableFrom}
              onChange={(e) => uf_update('availableFrom', e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Security features (comma-separated)</label>
            <input
              className="input"
              value={unitForm.securityFeatures}
              onChange={(e) => uf_update('securityFeatures', e.target.value)}
              placeholder="e.g. gated, CCTV, 24/7 guards"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Close to (comma-separated)</label>
            <input
              className="input"
              value={unitForm.proximityTags}
              onChange={(e) => uf_update('proximityTags', e.target.value)}
              placeholder="e.g. school, matatu stage, shopping center"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Utilities included (comma-separated)</label>
            <input
              className="input"
              value={unitForm.utilitiesIncluded}
              onChange={(e) => uf_update('utilitiesIncluded', e.target.value)}
              placeholder="e.g. water, wifi, garbage collection"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-paper-600">
            <input
              type="checkbox"
              checked={unitForm.parkingAvailable}
              onChange={(e) => uf_update('parkingAvailable', e.target.checked)}
              className="h-4 w-4 rounded border-paper-300 text-brand-700 focus:ring-brand-500"
            />
            Parking available
          </label>
          <label className="flex items-center gap-2 text-sm text-paper-600">
            <input
              type="checkbox"
              checked={unitForm.petFriendly}
              onChange={(e) => uf_update('petFriendly', e.target.checked)}
              className="h-4 w-4 rounded border-paper-300 text-brand-700 focus:ring-brand-500"
            />
            Pets allowed
          </label>
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
        open={typeOpen}
        onClose={() => setTypeOpen(false)}
        title={editingType ? `Edit ${editingType.typeName}` : 'Add unit type'}
        size="lg"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setTypeOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={saveUnitType}
              disabled={saving || !typeForm.typeName || !typeForm.baseRent}
            >
              {saving ? 'Saving…' : editingType ? 'Save changes' : 'Create unit type'}
            </button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Type name *</label>
            <input
              className="input"
              value={typeForm.typeName}
              onChange={(e) => setTypeForm((f) => ({ ...f, typeName: e.target.value }))}
              placeholder="e.g. 2BR Fully Furnished"
            />
          </div>
          <div>
            <label className="label">Unit type</label>
            <select
              className="input"
              value={typeForm.unitType}
              onChange={(e) => setTypeForm((f) => ({ ...f, unitType: e.target.value }))}
            >
              {unitTypes.map((t) => (
                <option key={t} value={t}>
                  {t.toLowerCase().replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Monthly rent (KSh) *</label>
            <input
              className="input"
              type="number"
              value={typeForm.baseRent}
              onChange={(e) => setTypeForm((f) => ({ ...f, baseRent: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Deposit (KSh)</label>
            <input
              className="input"
              type="number"
              value={typeForm.depositAmount}
              onChange={(e) => setTypeForm((f) => ({ ...f, depositAmount: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Bedrooms</label>
            <input
              className="input"
              type="number"
              value={typeForm.bedrooms}
              onChange={(e) => setTypeForm((f) => ({ ...f, bedrooms: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Bathrooms</label>
            <input
              className="input"
              type="number"
              value={typeForm.bathrooms}
              onChange={(e) => setTypeForm((f) => ({ ...f, bathrooms: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Size (sqm)</label>
            <input
              className="input"
              type="number"
              value={typeForm.sizeSqm}
              onChange={(e) => setTypeForm((f) => ({ ...f, sizeSqm: e.target.value }))}
            />
          </div>
          <div>
            <label className="label">Furnishing</label>
            <select
              className="input"
              value={typeForm.furnishedStatus}
              onChange={(e) => setTypeForm((f) => ({ ...f, furnishedStatus: e.target.value }))}
            >
              <option value="">Not set</option>
              {furnishedOptions.map((f) => (
                <option key={f} value={f}>
                  {f.toLowerCase().replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Water</label>
            <select
              className="input"
              value={typeForm.waterAvailability}
              onChange={(e) => setTypeForm((f) => ({ ...f, waterAvailability: e.target.value }))}
            >
              <option value="">Not set</option>
              {waterOptions.map((w) => (
                <option key={w} value={w}>
                  {w.toLowerCase().replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Parking spaces</label>
            <input
              className="input"
              type="number"
              value={typeForm.parkingSpaces}
              onChange={(e) => setTypeForm((f) => ({ ...f, parkingSpaces: e.target.value }))}
              placeholder="e.g. 2"
            />
          </div>
          <div>
            <label className="label">Available from</label>
            <input
              className="input"
              type="date"
              value={typeForm.availableFrom}
              onChange={(e) => setTypeForm((f) => ({ ...f, availableFrom: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Security features (comma-separated)</label>
            <input
              className="input"
              value={typeForm.securityFeatures}
              onChange={(e) => setTypeForm((f) => ({ ...f, securityFeatures: e.target.value }))}
              placeholder="e.g. gated, CCTV, 24/7 guards"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Close to (comma-separated)</label>
            <input
              className="input"
              value={typeForm.proximityTags}
              onChange={(e) => setTypeForm((f) => ({ ...f, proximityTags: e.target.value }))}
              placeholder="e.g. school, matatu stage, shopping center"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Utilities included (comma-separated)</label>
            <input
              className="input"
              value={typeForm.utilitiesIncluded}
              onChange={(e) => setTypeForm((f) => ({ ...f, utilitiesIncluded: e.target.value }))}
              placeholder="e.g. water, wifi, garbage collection"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-paper-600">
            <input
              type="checkbox"
              checked={typeForm.parkingAvailable}
              onChange={(e) => setTypeForm((f) => ({ ...f, parkingAvailable: e.target.checked }))}
              className="h-4 w-4 rounded border-paper-300 text-brand-700 focus:ring-brand-500"
            />
            Parking available
          </label>
          <label className="flex items-center gap-2 text-sm text-paper-600">
            <input
              type="checkbox"
              checked={typeForm.petFriendly}
              onChange={(e) => setTypeForm((f) => ({ ...f, petFriendly: e.target.checked }))}
              className="h-4 w-4 rounded border-paper-300 text-brand-700 focus:ring-brand-500"
            />
            Pets allowed
          </label>
          <div className="sm:col-span-2">
            <label className="label">Description</label>
            <textarea
              className="input"
              rows={3}
              value={typeForm.description}
              onChange={(e) => setTypeForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Describe the unit type, fittings and finishes"
            />
          </div>
          <div>
            <label className="label">Tracking</label>
            <select
              className="input"
              value={typeForm.trackingMode}
              onChange={(e) =>
                setTypeForm((f) => ({ ...f, trackingMode: e.target.value as 'AUTO' | 'MANUAL' }))
              }
            >
              <option value="AUTO">AUTO — derive vacancy from tenancies</option>
              <option value="MANUAL">MANUAL — track vacancy by hand</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-paper-600">
              <input
                type="checkbox"
                checked={typeForm.isPubliclyListable}
                onChange={(e) =>
                  setTypeForm((f) => ({ ...f, isPubliclyListable: e.target.checked }))
                }
                className="h-4 w-4 rounded border-paper-300 text-brand-700 focus:ring-brand-500"
              />
              List in public marketplace
            </label>
          </div>
          {typeForm.trackingMode === 'MANUAL' && (
            <>
              <div>
                <label className="label">Total units</label>
                <input
                  className="input"
                  type="number"
                  value={typeForm.totalCount}
                  onChange={(e) => setTypeForm((f) => ({ ...f, totalCount: e.target.value }))}
                />
              </div>
              <div>
                <label className="label">Vacant units</label>
                <input
                  className="input"
                  type="number"
                  value={typeForm.vacantCount}
                  onChange={(e) => setTypeForm((f) => ({ ...f, vacantCount: e.target.value }))}
                />
              </div>
            </>
          )}
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
