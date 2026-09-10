'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Users, ShieldCheck, ChevronRight, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/auth';
import { useToast } from '@/lib/toast';
import { Skeleton } from '@/components/ui/Skeleton';

interface InvitePreview {
  organizationName?: string | null;
  email: string;
  role: string;
  roleLabel: string;
}

export default function StaffInvitationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper-100 px-6">
          <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
        </div>
      }
    >
      <StaffInvitationFlow />
    </Suspense>
  );
}

function StaffInvitationFlow() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const { success, error } = useToast();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await api.get<InvitePreview>(`/public/staff-invitations/${token}`);
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
    if (!firstName.trim() || !lastName.trim()) {
      setFieldError('Please enter your first and last name.');
      return;
    }
    if (password !== confirm) {
      setFieldError('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setFieldError('Password must be at least 8 characters.');
      return;
    }
    setFieldError('');
    setSubmitting(true);
    try {
      await api.post(`/public/staff-invitations/${token}/accept`, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
      });
      setAccepted(true);
      success('Welcome aboard — your staff account is active.');
    } catch (e) {
      error(getErrorMessage(e));
      setInvalid(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-100 px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-700 text-white">
            <Users className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tightest text-paper-900">ProPrentals</span>
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
              This invitation link is invalid, expired, or already used. Ask your organization to
              send a fresh invitation.
            </p>
            <Link
              href="/login"
              className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
            >
              Go to sign in
            </Link>
          </div>
        ) : accepted ? (
          <div className="surface p-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Users className="h-6 w-6" />
            </div>
            <h1 className="mt-4 text-lg font-semibold text-paper-800">
              You&apos;re all set, {firstName || 'there'}!
            </h1>
            <p className="mt-1 text-sm text-paper-500">
              Your account is active as {preview?.roleLabel?.toLowerCase()} for{' '}
              {preview?.organizationName}. You can now sign in.
            </p>
            <Link href="/login" className="mt-5 btn-primary w-full">
              Sign in
            </Link>
          </div>
        ) : (
          <div className="surface overflow-hidden">
            <div className="border-b border-paper-200 bg-paper-50 px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-paper-400">
                You&apos;ve been invited to join
              </p>
              <h1 className="mt-1 text-lg font-semibold text-paper-900">
                {preview?.organizationName}
              </h1>
              <p className="mt-0.5 text-sm text-paper-500">
                Invited as <span className="font-medium capitalize">{preview?.roleLabel}</span>
                {preview?.email ? ` for ${preview.email}` : ''}
              </p>
            </div>

            <div className="px-6 py-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="firstName">First name</label>
                  <input
                    id="firstName"
                    className="input"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Jane"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="lastName">Last name</label>
                  <input
                    id="lastName"
                    className="input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div className="mt-4">
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
              <div className="mt-4">
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
                className="btn-primary mt-5 w-full py-2.5"
                onClick={accept}
                disabled={submitting}
              >
                {submitting ? 'Creating your account…' : 'Accept invitation'}
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
