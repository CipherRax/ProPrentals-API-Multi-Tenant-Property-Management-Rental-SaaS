'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Home, Lock, Mail } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/lib/toast';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const { error } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err) {
      error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 items-center justify-center bg-[#f4f5f7] px-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-white">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight text-ink-900">ProPrentals</div>
              <div className="text-xs text-ink-400">Property Management Platform</div>
            </div>
          </div>

          <h1 className="text-xl font-semibold tracking-tight text-ink-900">Welcome back</h1>
          <p className="mt-1 text-sm text-ink-500">
            Sign in to manage your properties and tenants.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
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
            <div>
              <div className="flex items-center justify-between">
                <label className="label mb-1.5" htmlFor="password">
                  Password
                </label>
                <span className="mb-1.5 text-xs text-ink-400">Forgot your password?</span>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
                <input
                  id="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="input pl-9"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            <button type="submit" className="btn-primary w-full py-2.5" disabled={submitting}>
              {submitting ? <Spinner className="h-4 w-4" /> : null}
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-ink-500">
            New to ProPrentals?{' '}
            <Link href="/register" className="font-medium text-brand-700 hover:text-brand-800">
              Create an account
            </Link>
          </p>

          <div className="mt-8 rounded-lg border border-ink-100 bg-surface p-3 text-center">
            <p className="text-xs text-ink-500">
              Demo access ·{' '}
              <span className="font-medium text-ink-700">owner@demo-landlord.app</span> /{' '}
              <span className="font-medium text-ink-700">DemoOwner@123</span>
            </p>
          </div>
        </div>
      </div>

      <div className="hidden w-[42%] flex-col justify-between bg-brand-800 p-10 text-white lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white">
            <Home className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">ProPrentals</span>
        </div>
        <div>
          <blockquote className="text-2xl font-light leading-snug">
            “Running a portfolio shouldn&apos;t mean juggling twenty spreadsheets. ProPrentals puts the
            entire rental lifecycle in one calm, clear place.”
          </blockquote>
          <div className="mt-5 text-sm text-brand-100">
            <div className="font-medium text-white">Portfolio of 40+ units</div>
            <div>Landlord, Nairobi</div>
          </div>
        </div>
        <p className="text-xs text-brand-100/70">
          Rent collection · Receipts · Maintenance · Tenant messaging · Reporting
        </p>
      </div>
    </div>
  );
}
