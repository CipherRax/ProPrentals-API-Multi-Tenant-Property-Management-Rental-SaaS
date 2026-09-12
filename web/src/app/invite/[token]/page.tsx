'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  Home,
  Building2,
  DoorOpen,
  ShieldCheck,
  Wallet,
  ChevronRight,
  Loader2,
  BadgeAlert,
} from 'lucide-react';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { PageTitle } from '@/components/ui/PageTitle';
import { Skeleton } from '@/components/ui/Skeleton';

interface InvitePreview {
  organizationName?: string | null;
  tenantFullName: string;
  property?: { name?: string; city?: string | null; county?: string | null } | null;
  unit?: {
    unitNumber: string;
    unitType?: string | null;
    bedrooms?: number | null;
    bathrooms?: number | null;
  } | null;
  proposedRentAmount?: string | number;
  proposedDepositAmount?: string | number;
  customRent?: boolean;
  customDeposit?: boolean;
}

const formatAmount = (value?: string | number) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('en-KE', {
        style: 'currency',
        currency: 'KES',
        maximumFractionDigits: 0,
      }).format(Number(value));

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper-100 px-6">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      }
    >
      <InviteFlow />
    </Suspense>
  );
}

function InviteFlow() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { success, error } = useToast();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.get<InvitePreview>(
        `/public/tenant-invitations/${token}`,
      );
      setPreview(data);
    } catch {
      setInvalid(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const accept = async () => {
    if (password !== confirm) {
      setFieldError('Passwords do not match.');
      return;
    }
    if (password && password.length < 8) {
      setFieldError('Password must be at least 8 characters.');
      return;
    }
    setFieldError('');
    setSubmitting(true);
    try {
      await api.post(`/public/tenant-invitations/${token}/accept`, {
        password: password || undefined,
      });
      setAccepted(true);
      success('Welcome aboard — your tenancy is active.');
    } catch (e) {
      error(getErrorMessage(e));
      setInvalid(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-50 px-6 py-12">
      <PageTitle title="You're invited" />
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-700 text-white">
            <Home className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-paper-900">Habita</span>
        </div>

        {loading ? (
          <div className="surface p-6">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="mt-3 h-3.5 w-full" />
            <Skeleton className="mt-2 h-3.5 w-4/5" />
            <Skeleton className="mt-6 h-10 w-full" />
          </div>
        ) : invalid ? (
          <div className="surface p-8 text-center">
            <ShieldCheck className="mx-auto h-10 w-10 text-paper-300" />
            <h1 className="mt-4 text-lg font-semibold text-paper-800">Invitation unavailable</h1>
            <p className="mt-1 text-sm text-paper-500">
              This invitation link is invalid, expired, or already used. Ask your landlord to
              send a fresh invitation.
            </p>
            <Link href="/login" className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
              Go to sign in
            </Link>
          </div>
        ) : accepted ? (
          <div className="surface p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Home className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-paper-800">You&apos;re all set, {preview?.tenantFullName?.split(' ')[0]}!</h1>
            <p className="mt-1 text-sm text-paper-500">
              Your account is active and linked to {preview?.organizationName}. You can now sign
              in to see your rent and pay online.
            </p>
            <Link href="/login" className="mt-5 btn-primary w-full">
              Sign in
            </Link>
          </div>
        ) : (
          <div className="surface overflow-hidden">
            <div className="border-b border-paper-200 bg-paper-50 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-paper-400">
                You&apos;ve been invited
              </p>
              <h1 className="mt-1 text-lg font-semibold text-paper-900">
                {preview?.organizationName}
              </h1>
              <p className="mt-0.5 text-sm text-paper-500">
                Welcome, {preview?.tenantFullName}
              </p>
            </div>

            <div className="grid grid-cols-1 divide-y divide-paper-100 px-6 py-4 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="flex items-center gap-3 py-2 sm:pr-4">
                <Building2 className="h-5 w-5 text-brand-700" />
                <div>
                  <div className="text-xs text-paper-400">Property</div>
                  <div className="text-sm font-medium text-paper-800">
                    {preview?.property?.name}
                    {preview?.property?.city ? ` · ${preview.property.city}` : ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 py-2 sm:pl-4">
                <DoorOpen className="h-5 w-5 text-brand-700" />
                <div>
                  <div className="text-xs text-paper-400">Unit</div>
                  <div className="text-sm font-medium text-paper-800">
                    {preview?.unit?.unitNumber}
                    {preview?.unit?.bedrooms
                      ? ` · ${preview.unit.bedrooms} bed${preview.unit.bedrooms > 1 ? 's' : ''}`
                      : ''}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-paper-100 border-t border-paper-100 px-6 py-4">
              <div className="flex items-center gap-3 pr-4">
                <Wallet className="h-5 w-5 text-brand-700" />
                <div>
                  <div className="text-xs text-paper-400">Rent / month</div>
                  <div className="text-sm font-semibold text-paper-900">
                    {formatAmount(preview?.proposedRentAmount)}
                    {preview?.customRent && (
                      <span className="ml-1.5 inline-block rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        custom
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 pl-4">
                <Wallet className="h-5 w-5 text-brand-700" />
                <div>
                  <div className="text-xs text-paper-400">Deposit</div>
                  <div className="text-sm font-semibold text-paper-900">
                    {formatAmount(preview?.proposedDepositAmount)}
                    {preview?.customDeposit && (
                      <span className="ml-1.5 inline-block rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        custom
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6">
              {(preview?.customRent || preview?.customDeposit) && (
                <div className="mb-4 rounded-panel border border-amber-200 bg-amber-50 p-3">
                  <p className="flex items-start gap-2 text-xs text-amber-800">
                    <BadgeAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    Your landlord offered a custom rent and/or deposit for this unit. Accepting
                    confirms you agree to the amounts shown above.
                  </p>
                </div>
              )}
              <div className="rounded-panel border border-brand-100 bg-brand-50/40 p-4">
                <p className="flex items-start gap-2 text-sm text-paper-600">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" />
                  Set a password to create and activate your account. If you already have a
                  Habita account, leave this blank and sign in instead to link it.
                </p>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  <label className="label" htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    className="input"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="confirm">Confirm password</label>
                  <input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    className="input"
                    placeholder="Repeat password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                  {fieldError && <p className="field-error">{fieldError}</p>}
                </div>
                <button
                  className="btn-primary w-full py-2.5"
                  onClick={accept}
                  disabled={submitting}
                >
                  {submitting ? 'Activating your account…' : 'Accept invitation'}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
