'use client';

import { Suspense, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Lock, Home, ArrowLeft, KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/auth';
import { useToast } from '@/lib/toast';

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper-100 px-6">
          <div className="w-full max-w-sm">Loading…</div>
        </div>
      }
    >
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const { success, error } = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) {
      setFieldError('This reset link is invalid or incomplete. Please request a new one.');
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
      await api.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
      success('Password updated.');
    } catch (err) {
      error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper-100 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand-700 text-white">
            <Home className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tightest text-paper-900">ProPrentals</div>
            <div className="text-xs text-paper-400">Property Management Platform</div>
          </div>
        </div>

        <h1 className="text-xl font-semibold tracking-tightest text-paper-900">Choose a new password</h1>
        <p className="mt-1 text-sm text-paper-500">Use at least 8 characters with upper, lower, and a number.</p>

        {done ? (
          <div className="mt-8 rounded-panel border border-emerald-100 bg-emerald-50 px-5 py-6 text-center">
            <KeyRound className="mx-auto h-8 w-8 text-emerald-600" />
            <h2 className="mt-3 text-base font-semibold text-paper-800">Password updated</h2>
            <p className="mt-1 text-sm text-paper-600">
              Your password has been reset successfully. You can now sign in.
            </p>
            <Link href="/login" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
              Go to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="password">New password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-300" />
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  className="input pl-9"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="confirm">Confirm password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-300" />
                <input
                  id="confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  className="input pl-9"
                  placeholder="••••••••"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {fieldError && <p className="field-error">{fieldError}</p>}
            </div>
            <button type="submit" className="btn-primary w-full py-2.5" disabled={submitting}>
              {submitting ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-paper-500">
          <Link href="/login" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:text-brand-800">
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
