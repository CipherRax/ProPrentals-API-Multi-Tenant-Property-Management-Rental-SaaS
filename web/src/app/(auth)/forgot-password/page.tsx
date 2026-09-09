'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Mail, Home, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { getErrorMessage } from '@/lib/auth';
import { useToast } from '@/lib/toast';

export default function ForgotPasswordPage() {
  const { success, error } = useToast();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
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

        <h1 className="text-xl font-semibold tracking-tightest text-paper-900">Reset your password</h1>
        <p className="mt-1 text-sm text-paper-500">
          Enter your account email and we&apos;ll send you a reset link.
        </p>

        {sent ? (
          <div className="mt-8 rounded-panel border border-emerald-100 bg-emerald-50 px-5 py-6 text-center">
            <Mail className="mx-auto h-8 w-8 text-emerald-600" />
            <h2 className="mt-3 text-base font-semibold text-paper-800">Check your inbox</h2>
            <p className="mt-1 text-sm text-paper-600">
              We&apos;ve sent a password reset link to <span className="font-medium">{email}</span>.
              It expires in 30 minutes.
            </p>
            <Link href="/login" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800">
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-300" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  className="input pl-9"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary w-full py-2.5" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send reset link'}
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
