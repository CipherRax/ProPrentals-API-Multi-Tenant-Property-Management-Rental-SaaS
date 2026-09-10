'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Home,
  Lock,
  Mail,
  User,
  Building2,
  Eye,
  EyeOff,
  ArrowLeft,
  KeyRound,
} from 'lucide-react';
import { useAuth, getErrorMessage } from '@/lib/auth';
import { Spinner } from '@/components/ui/Spinner';
import { PageTitle } from '@/components/ui/PageTitle';
import { useToast } from '@/lib/toast';

type Stage = 'ask' | 'form' | 'tenant';

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const { error } = useToast();
  const [stage, setStage] = useState<Stage>('ask');
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    organizationName: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const update = (field: keyof typeof form, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const home = await register(form);
      router.replace(home);
    } catch (err) {
      error(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      <PageTitle title="Create your account" />
      <div className="flex flex-1 items-center justify-center bg-paper-50 px-6 py-10">
        <div className="w-full max-w-md rounded-card border border-paper-200 bg-white p-8 shadow-card sm:p-10">
          {stage === 'ask' && (
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-card bg-brand-500 text-white shadow-sm">
                <Building2 className="h-6 w-6" />
              </div>
              <h1 className="mt-5 text-xl font-semibold tracking-tight text-paper-900">
                Are you a landlord or property owner?
              </h1>
              <p className="mt-2 text-sm text-paper-500">
                Habita accounts are for people who own or manage rentals. It&apos;s how you list
                your properties, collect rent, and keep tenants in the loop.
              </p>

              <div className="mt-6 space-y-3 text-left">
                <button
                  className="btn-primary w-full py-3"
                  onClick={() => setStage('form')}
                >
                  <Building2 className="h-4 w-4" />
                  Yes, I own or manage properties
                </button>
                <button
                  className="btn-secondary w-full py-3"
                  onClick={() => setStage('tenant')}
                >
                  <Home className="h-4 w-4" />
                  I&apos;m a tenant
                </button>
              </div>
              <p className="mt-5 text-xs text-paper-400">
                Tenants don&apos;t self-register — your landlord sends you an invite link once
                they&apos;ve added you to a property.
              </p>
            </div>
          )}

          {stage === 'tenant' && (
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <Home className="h-6 w-6" />
              </div>
              <h1 className="mt-5 text-xl font-semibold tracking-tight text-paper-900">
                You don&apos;t need an account to move in
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-paper-500">
                Tenants get access through an invite from their landlord. Once you&apos;re added to a
                property, your invite link lets you pay rent, view receipts, and log maintenance
                requests — so you&apos;re always in control.
              </p>

              <div className="mt-6 space-y-3 text-left">
                <Link href="mailto:support@habita.app" className="btn-secondary w-full">
                  <KeyRound className="h-4 w-4" />
                  Waiting on an invite? Contact us
                </Link>
                <button
                  className="btn-ghost w-full"
                  onClick={() => setStage('ask')}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Actually, I do manage properties
                </button>
              </div>
            </div>
          )}

          {stage === 'form' && (
            <>
              <div className="mb-8 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setStage('ask')}
                  aria-label="Back"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-paper-200 text-paper-500 hover:text-paper-700"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex h-11 w-11 items-center justify-center rounded-card bg-brand-500 text-white shadow-sm">
                  <Home className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-lg font-semibold tracking-tight text-paper-900">
                    Let&apos;s get you set up
                  </div>
                  <div className="text-xs text-paper-400">
                    It takes about a minute — then your rentals are up and running
                  </div>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label" htmlFor="firstName">
                      First name
                    </label>
                    <div className="relative">
                      <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-300" />
                      <input
                        id="firstName"
                        required
                        className="input pl-9"
                        value={form.firstName}
                        onChange={(e) => update('firstName', e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="lastName">
                      Last name
                    </label>
                    <input
                      id="lastName"
                      required
                      className="input"
                      value={form.lastName}
                      onChange={(e) => update('lastName', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="org">
                    Organization name
                  </label>
                  <div className="relative">
                    <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-300" />
                    <input
                      id="org"
                      required
                      className="input pl-9"
                      placeholder="e.g. Sunview Properties"
                      value={form.organizationName}
                      onChange={(e) => update('organizationName', e.target.value)}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-paper-500">
                    This is the name tenants and staff see on receipts, invoices, and emails.
                  </p>
                </div>

                <div>
                  <label className="label" htmlFor="email">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-300" />
                    <input
                      id="email"
                      type="email"
                      required
                      className="input pl-9"
                      value={form.email}
                      onChange={(e) => update('email', e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="label" htmlFor="password">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-paper-400" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      className="input pl-9 pr-10"
                      placeholder="At least 8 characters"
                      value={form.password}
                      onChange={(e) => update('password', e.target.value)}
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

                <button type="submit" className="btn-primary w-full py-2.5" disabled={submitting}>
                  {submitting ? <Spinner className="h-4 w-4" /> : null}
                  {submitting ? 'Creating account…' : 'Create account'}
                </button>
              </form>
            </>
          )}

          <p className="mt-6 text-center text-sm text-paper-500">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-brand-700 hover:text-brand-800">
              Sign in
            </Link>
          </p>
        </div>
      </div>

      <div className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-500 via-brand-700 to-brand-900 p-10 text-white lg:flex">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white">
            <Home className="h-4 w-4" />
          </div>
          <span className="text-sm font-semibold">Habita</span>
        </div>
        <ul className="relative space-y-4 text-sm text-brand-100">
          <li className="flex gap-3">
            <span className="font-semibold text-white">One workspace</span> for your whole portfolio
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-white">Automatic rent</span> generation and receipts
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-white">Built-in messaging</span> with your tenants
          </li>
          <li className="flex gap-3">
            <span className="font-semibold text-white">Clear reporting</span> on what you&apos;ve earned
          </li>
        </ul>
        <p className="relative text-xs text-brand-100/80">
          Start on the Free plan — no credit card required.
        </p>
      </div>
    </div>
  );
}