'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Home, Lock, Mail, Eye, EyeOff, AlertCircle, ShieldCheck, Zap, MessageSquare } from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/lib/toast';

export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const { error: toastError, success } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [inlineError, setInlineError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setInlineError('');
    try {
      const home = await login(email, password);
      success(`Welcome back, ${user?.firstName ?? email.split('@')[0] ?? 'there'}`);
      router.replace(home);
    } catch (err) {
      const message = getErrorMessage(err);
      setInlineError(message);
      toastError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 items-center justify-center bg-paper-50 px-6">
        <div className="w-full max-w-md rounded-card border border-paper-200 bg-white p-8 shadow-card sm:p-10">
          <div className="mb-8 flex items-center gap-2.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-card bg-brand-500 text-white shadow-sm">
              <Home className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight text-paper-900">ProPrentals</div>
              <div className="text-xs text-paper-400">Property Management Platform</div>
            </div>
          </div>

          <h1 className="text-xl font-semibold tracking-tight text-paper-900">Welcome back</h1>
          <p className="mt-1 text-sm text-paper-500">
            Sign in to manage your properties and tenants.
          </p>

          {inlineError && (
            <div
              role="alert"
              className="mt-5 flex items-start gap-2.5 rounded-panel border border-red-100 bg-red-50 px-3.5 py-3 text-sm text-red-700"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{inlineError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="email">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
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
                <Link
                  href="/forgot-password"
                  className="mb-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
                >
                  Forgot your password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  className="input pl-9 pr-10"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-paper-400 hover:text-paper-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              className="btn-primary w-full py-2.5"
              disabled={submitting}
            >
              {submitting ? <Spinner className="h-4 w-4" /> : null}
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-paper-500">
            New to ProPrentals?{' '}
            <Link href="/register" className="font-semibold text-brand-600 hover:text-brand-700">
              Create an account
            </Link>
          </p>

          <div className="mt-8 rounded-panel border border-paper-200 bg-paper-50 p-3 text-center">
            <p className="text-xs text-paper-500">
              Demo access ·{' '}
              <span className="font-medium text-paper-700">owner@demo-landlord.app</span> /{' '}
              <span className="font-medium text-paper-700">DemoOwner@123</span>
            </p>
          </div>
        </div>
      </div>

      <div className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-500 via-brand-700 to-brand-900 p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white">
            <Home className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">ProPrentals</span>
        </div>

        <div className="relative">
          <p className="text-xs font-medium uppercase tracking-widest text-brand-100">
            Rental management, made simple
          </p>
          <blockquote className="mt-4 text-2xl font-light leading-snug">
            “Running a portfolio shouldn&apos;t mean juggling twenty spreadsheets. ProPrentals puts
            the entire rental lifecycle in one calm, clear place.”
          </blockquote>
          <div className="mt-5 text-sm text-brand-100">
            <div className="font-medium text-white">Portfolio of 40+ units</div>
            <div>Landlord, Nairobi</div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-3">
            <div className="flex items-center gap-3 rounded-panel bg-white/10 px-4 py-3 backdrop-blur-sm">
              <Zap className="h-5 w-5 shrink-0 text-brand-100" />
              <div className="text-sm">
                <span className="font-semibold text-white">Automatic rent</span>{' '}
                <span className="text-brand-100">generation and receipts</span>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-panel bg-white/10 px-4 py-3 backdrop-blur-sm">
              <MessageSquare className="h-5 w-5 shrink-0 text-brand-100" />
              <div className="text-sm">
                <span className="font-semibold text-white">Built-in messaging</span>{' '}
                <span className="text-brand-100">with tenants and staff</span>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-panel bg-white/10 px-4 py-3 backdrop-blur-sm">
              <ShieldCheck className="h-5 w-5 shrink-0 text-brand-100" />
              <div className="text-sm">
                <span className="font-semibold text-white">Clear reporting</span>{' '}
                <span className="text-brand-100">on what you&apos;ve earned</span>
              </div>
            </div>
          </div>
        </div>

        <p className="relative text-xs text-brand-100/80">
          Rent collection · Receipts · Maintenance · Tenant messaging · Reporting
        </p>
      </div>
    </div>
  );
}