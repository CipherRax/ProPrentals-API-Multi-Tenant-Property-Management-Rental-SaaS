import type { Metadata } from 'next';
import Link from 'next/link';
import { Home } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Terms of Service — Habita',
  description: 'The terms that apply when you use Habita.',
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-paper-50">
      <header className="border-b border-paper-200 bg-white">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/public" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-white">
              <Home className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-paper-900">Habita</span>
          </Link>
          <Link href="/public" className="text-sm font-medium text-brand-700 hover:text-brand-800">
            Browse rentals
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight text-paper-900">Terms of Service</h1>
        <p className="mt-1 text-sm text-paper-500">Last updated: {new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <div className="mt-8 space-y-6 text-paper-600">
          <section>
            <h2 className="text-base font-semibold text-paper-900">The service</h2>
            <p className="mt-2">
              Habita is a property management platform. It helps landlords and property managers keep
              track of their units, tenants, rent invoices, payments, receipts, maintenance requests,
              announcements, and tenant communication — all in one place.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-paper-900">Your account</h2>
            <p className="mt-2">
              You are responsible for keeping your login details secure and for activity that happens
              under your account. If you add staff or tenants to your workspace, you are responsible
              for the access you grant them.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-paper-900">Payments & subscriptions</h2>
            <p className="mt-2">
              Choose a paid plan, you agree to pay the fees listed for your plan. Rent payments from
              tenants and subscription payments are processed by third-party payment providers
              (including M-PESA). You agree to only collect payments you are entitled to receive.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-paper-900">Acceptable use</h2>
            <p className="mt-2">
              You may not use Habita for any unlawful activity, to misrepresent your properties or
              tenancies, or to harass others. We may suspend accounts that violate these terms.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-paper-900">Limitation of liability</h2>
            <p className="mt-2">
              Habita is provided &ldquo;as is.&rdquo; We work hard to keep the service reliable and
              secure, but to the fullest extent permitted by law, we are not liable for loss of
              income, data, or other indirect damages arising from your use of the platform.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-paper-900">Changes & contact</h2>
            <p className="mt-2">
              We may update these terms from time to time and will post any changes here. Questions?
              Reach us at{' '}
              <a href="mailto:support@habita.app" className="font-medium text-brand-700 hover:text-brand-800">
                support@habita.app
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}