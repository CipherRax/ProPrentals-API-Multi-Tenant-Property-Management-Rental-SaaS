'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Save, Mail, Building2, ChevronDown, DoorOpen, Pencil } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { api, resolveAssetUrl } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { Spinner } from '@/components/ui/Spinner';
import { initials } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Property, Unit } from '@/types';

export default function ProfilePage() {
  const { user, refreshUser, activeOrg, refreshOrganizations } = useAuth();
  const { success, error } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: user?.firstName ?? '',
    lastName: user?.lastName ?? '',
  });

  const isOrgAdmin =
    activeOrg?.myRole === 'OWNER' || activeOrg?.myRole === 'PROPERTY_MANAGER';

  const [orgName, setOrgName] = useState(activeOrg?.name ?? '');
  const [savingOrg, setSavingOrg] = useState(false);

  useEffect(() => {
    setOrgName(activeOrg?.name ?? '');
  }, [activeOrg?.name]);

  const uploadAvatar = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.upload('/users/me/avatar', [file]);
      await refreshUser();
      success('Profile photo updated.');
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const saveName = async () => {
    setSaving(true);
    try {
      await api.patch('/users/me', {
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
      });
      await refreshUser();
      success('Profile updated.');
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const saveOrgName = async () => {
    if (!activeOrg || !orgName.trim()) return;
    setSavingOrg(true);
    try {
      await api.patch(`/organizations/${activeOrg.id}`, { name: orgName.trim() });
      await refreshOrganizations();
      success('Organization name updated.');
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSavingOrg(false);
    }
  };

  const avatarUrl = resolveAssetUrl(user?.avatarUrl);

  return (
    <div>
      <PageHeader
        title="My profile"
        description="Your photo and name appear in chats, notifications, and the sidebar."
      />

      <div className="surface mx-auto max-w-xl p-6">
        <div className="flex items-center gap-5 border-b border-paper-100 pb-6">
          <div className="relative">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="Profile"
                className="h-20 w-20 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-brand-700/10 text-xl font-semibold text-brand-800">
                {user ? initials(`${user.firstName} ${user.lastName}`) : '?'}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Upload profile photo"
              className="absolute -bottom-1 -right-1 rounded-full bg-brand-700 p-2 text-white shadow-md hover:bg-brand-800 disabled:opacity-60"
            >
              {uploading ? <Spinner className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              hidden
              onChange={(e) => {
                uploadAvatar(e.target.files);
                e.target.value = '';
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="text-base font-semibold text-paper-900">
              {user?.firstName} {user?.lastName}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-sm text-paper-500">
              <Mail className="h-3.5 w-3.5" /> {user?.email}
            </div>
            <div className="mt-2">
              <button
                type="button"
                className="text-xs font-medium text-brand-700 hover:underline"
                onClick={() => fileRef.current?.click()}
              >
                Change photo
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pf-first">First name</label>
            <input
              id="pf-first"
              className="input"
              value={form.firstName}
              onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="pf-last">Last name</label>
            <input
              id="pf-last"
              className="input"
              value={form.lastName}
              onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Email</label>
            <input className="input opacity-60" value={user?.email ?? ''} readOnly />
          </div>
        </div>

        <div className="mt-6 flex justify-end border-t border-paper-100 pt-4">
          <button
            className={cn('btn-primary', saving && 'pointer-events-none opacity-60')}
            disabled={saving}
            onClick={saveName}
          >
            {saving ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </div>
      </div>

      {isOrgAdmin && activeOrg && (
        <div className="mx-auto mt-8 max-w-xl space-y-6">
          <section className="surface p-6">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700/10 text-brand-700">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-paper-800">Organization</h2>
                <p className="text-xs text-paper-400">The name shown to tenants and in your billing.</p>
              </div>
            </div>
            <div>
              <label className="label" htmlFor="pf-org">Organization name</label>
              <input
                id="pf-org"
                className="input"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </div>
            <div className="mt-4 flex justify-end">
              <button
                className={cn('btn-primary', savingOrg && 'pointer-events-none opacity-60')}
                disabled={savingOrg || !orgName.trim()}
                onClick={saveOrgName}
              >
                {savingOrg ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
                Rename organization
              </button>
            </div>
          </section>

          <PropertiesAdminCard organizationId={activeOrg.id} />
        </div>
      )}
    </div>
  );
}

function PropertiesAdminCard({ organizationId }: { organizationId: string }) {
  const { success, error } = useToast();
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const res = await api.getList<Property>(`/organizations/${organizationId}/properties`);
      setProperties(res.items);
    } catch (e) {
      error(getErrorMessage(e));
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, [organizationId, error]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="surface p-6">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-paper-100 text-paper-500">
          <DoorOpen className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-paper-800">Properties & units</h2>
          <p className="text-xs text-paper-400">
            Rename any property or unit directly from here.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8 text-paper-400">
          <Spinner className="h-5 w-5" />
        </div>
      ) : (
        <div className="space-y-3">
          {(properties ?? []).length === 0 && (
            <p className="py-6 text-center text-sm text-paper-400">No properties yet.</p>
          )}
          {(properties ?? []).map((p) => (
            <PropertyAdminRow key={p.id} organizationId={organizationId} property={p} />
          ))}
        </div>
      )}
    </section>
  );
}

function PropertyAdminRow({
  organizationId,
  property,
}: {
  organizationId: string;
  property: Property;
}) {
  const { success, error } = useToast();
  const [name, setName] = useState(property.name);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [loadingUnits, setLoadingUnits] = useState(false);

  useEffect(() => setName(property.name), [property.name]);

  const saveName = async () => {
    if (!name.trim() || name.trim() === property.name) return;
    setSaving(true);
    try {
      await api.patch(`/organizations/${organizationId}/properties/${property.id}`, {
        name: name.trim(),
      });
      success('Property renamed.');
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleUnits = async () => {
    const next = !expanded;
    setExpanded(next);
    if (!next || units) return;
    setLoadingUnits(true);
    try {
      const res = await api.getList<Unit>(
        `/organizations/${organizationId}/properties/${property.id}/units`,
      );
      setUnits(res.items);
    } catch (e) {
      error(getErrorMessage(e));
      setUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  };

  return (
    <div className="rounded-panel border border-paper-200">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="text-paper-400 transition hover:text-brand-700"
          onClick={toggleUnits}
          aria-label={expanded ? 'Collapse units' : 'Expand units'}
        >
          <ChevronDown className={cn('h-4 w-4 transition', expanded && 'rotate-180')} />
        </button>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-paper-100 text-paper-500">
          <Building2 className="h-4 w-4" />
        </span>
        <input
          className="input flex-1 border-transparent px-2 py-1.5 shadow-none focus:border-brand-300"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label={`Rename property ${property.name}`}
        />
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
            name.trim() && name.trim() !== property.name
              ? 'bg-brand-700 text-white hover:bg-brand-800'
              : 'cursor-default text-paper-300',
          )}
          disabled={saving || !name.trim() || name.trim() === property.name}
          onClick={saveName}
        >
          {saving ? <Spinner className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          Rename
        </button>
      </div>

      {expanded && (
        <div className="border-t border-paper-100 px-3 py-2 pl-10">
          {loadingUnits ? (
            <div className="flex justify-center py-4 text-paper-400">
              <Spinner className="h-4 w-4" />
            </div>
          ) : (units ?? []).length === 0 ? (
            <p className="py-3 text-xs text-paper-400">No units on this property yet.</p>
          ) : (
            <div className="space-y-2">
              {(units ?? []).map((u) => (
                <UnitAdminRow
                  key={u.id}
                  organizationId={organizationId}
                  propertyId={property.id}
                  unit={u}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UnitAdminRow({
  organizationId,
  propertyId,
  unit,
}: {
  organizationId: string;
  propertyId: string;
  unit: Unit;
}) {
  const { success, error } = useToast();
  const [number, setNumber] = useState(unit.unitNumber);
  const [saving, setSaving] = useState(false);

  useEffect(() => setNumber(unit.unitNumber), [unit.unitNumber]);

  const save = async () => {
    if (!number.trim() || number.trim() === unit.unitNumber) return;
    setSaving(true);
    try {
      await api.patch(`/organizations/${organizationId}/properties/${propertyId}/units/${unit.id}`, {
        unitNumber: number.trim(),
      });
      success('Unit renamed.');
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-paper-400">
        {(unit.unitTypeDefinition?.typeName ?? 'Unit').replaceAll('_', ' ')}
      </span>
      <input
        className="input flex-1 border-transparent px-2 py-1.5 shadow-none focus:border-brand-300"
        value={number}
        onChange={(e) => setNumber(e.target.value)}
        aria-label={`Rename unit ${unit.unitNumber}`}
      />
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
          number.trim() && number.trim() !== unit.unitNumber
            ? 'bg-brand-700 text-white hover:bg-brand-800'
            : 'cursor-default text-paper-300',
        )}
        disabled={saving || !number.trim() || number.trim() === unit.unitNumber}
        onClick={save}
      >
        {saving ? <Spinner className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        Rename
      </button>
    </div>
  );
}