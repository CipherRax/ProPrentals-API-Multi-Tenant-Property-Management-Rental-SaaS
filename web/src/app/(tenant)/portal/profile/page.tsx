'use client';

import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { User, Save, Building2, Phone, MapPin, HeartHandshake, Camera } from 'lucide-react';
import { api, formatDate, resolveAssetUrl } from '@/lib/api';
import { tenantQueryKeys, useTenantPrimary } from '@/lib/tenant';
import { getErrorMessage } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { Skeleton } from '@/components/ui/Skeleton';
import type { MyTenantProfile } from '@/types/tenant';

export default function TenantProfilePage() {
  const { profiles, loading } = useTenantPrimary();

  return (
    <div>
      <PageHeader
        title="My profile"
        description="Your details as held by your landlord. You can update your phone, address, and emergency contact below."
      />

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : !profiles.length ? (
        <div className="surface p-8 text-center text-sm text-paper-500">
          No tenant profile is linked to your account yet — contact your landlord to get set up.
        </div>
      ) : (
        <div className="space-y-6">
          {profiles.map((p) => (
            <ProfileCard key={p.id} profile={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileCard({ profile }: { profile: MyTenantProfile }) {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    phone: profile.phone ?? '',
    emergencyContactName: profile.emergencyContactName ?? '',
    emergencyContactPhone: profile.emergencyContactPhone ?? '',
    addressLine: profile.addressLine ?? '',
  });

  const update = (field: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const uploadAvatar = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await api.upload(`/tenants/me/profiles/${profile.id}/avatar`, [file]);
      success('Profile photo updated — looking good!');
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.profiles });
    } catch (e) {
      error(getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/tenants/me/profiles/${profile.id}`, {
        phone: form.phone || undefined,
        emergencyContactName: form.emergencyContactName || undefined,
        emergencyContactPhone: form.emergencyContactPhone || undefined,
        addressLine: form.addressLine || undefined,
      }),
    onSuccess: () => {
      success('Profile updated — your details are saved.');
      queryClient.invalidateQueries({ queryKey: tenantQueryKeys.profiles });
    },
    onError: (err) => error(getErrorMessage(err)),
  });

  const image = resolveAssetUrl(profile.profileImageUrl);

  return (
    <div className="surface overflow-hidden">
      <div className="flex items-start gap-4 border-b border-paper-200 bg-paper-50/60 px-5 py-4">
        <div className="relative">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={profile.fullName}
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-700/10 text-brand-800">
              <User className="h-6 w-6" />
            </div>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Upload profile photo"
            className="absolute -bottom-1 -right-1 rounded-full bg-brand-700 p-1.5 text-white shadow-md hover:bg-brand-800 disabled:opacity-60"
          >
            {uploading ? <Spinner className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
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
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-paper-900">{profile.fullName}</h2>
            <StatusBadge status={profile.status}>{profile.status.toLowerCase()}</StatusBadge>
          </div>
          <p className="text-sm text-paper-500">{profile.email}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-paper-400">
            <Building2 className="h-3.5 w-3.5" />
            {profile.organization.name}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-5 lg:grid-cols-2">
        <Field label="Tenancy">
          {profile.tenancies.length ? (
            profile.tenancies.map((t) => (
              <span key={t.id} className="text-sm font-medium text-paper-800">
                Unit {t.unit.unitNumber} · since {formatDate(t.startDate)} · {t.status.toLowerCase()}
              </span>
            ))
          ) : (
            <span className="text-sm text-paper-400">No active tenancy</span>
          )}
        </Field>
        <div>
          <label className="label" htmlFor={`phone-${profile.id}`}>Phone</label>
          <div className="relative">
            <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-300" />
            <input
              id={`phone-${profile.id}`}
              className="input pl-9"
              value={form.phone}
              onChange={(e) => update('phone', e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`addr-${profile.id}`}>Address</label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-300" />
            <input
              id={`addr-${profile.id}`}
              className="input pl-9"
              value={form.addressLine}
              onChange={(e) => update('addressLine', e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`em-name-${profile.id}`}>Emergency contact name</label>
          <div className="relative">
            <HeartHandshake className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-300" />
            <input
              id={`em-name-${profile.id}`}
              className="input pl-9"
              value={form.emergencyContactName}
              onChange={(e) => update('emergencyContactName', e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className="label" htmlFor={`em-phone-${profile.id}`}>Emergency contact phone</label>
          <input
            id={`em-phone-${profile.id}`}
            className="input"
            value={form.emergencyContactPhone}
            onChange={(e) => update('emergencyContactPhone', e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-end border-t border-paper-100 px-5 py-3">
        <button
          className="btn-primary"
          disabled={saveMutation.isPending}
          onClick={() => saveMutation.mutate()}
        >
          {saveMutation.isPending ? <Spinner className="h-4 w-4" /> : <Save className="h-4 w-4" />}
          Save changes
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}