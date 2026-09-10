import type { Metadata } from 'next';
import Link from 'next/link';
import { Home } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Privacy Policy — Habita',
  description: 'How Habita collects, uses, and protects your information.',
};

export default function PrivacyPage() {
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
        <h1 className="text-2xl font-semibold tracking-tight text-paper-900">Privacy Policy</h1>
        <p className="mt-1 text-sm text-paper-500">Last updated: {new Date().toLocaleDateString('en-KE', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <div className="prose-sm mt-8 space-y-6 text-paper-600">
          <section>
            <h2 className="text-base font-semibold text-paper-900">What we collect</h2>
            <p className="mt-2">
              When you create an account, we collect your name, email address, and password (which we
              store only as a secure hash). As you use Habita, we store the property, tenant, rent,
              payment, and maintenance information you add, so your portfolio is available to you and
              the staff or tenants you give access to.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-paper-900">How we use it</h2>
            <p className="mt-2">
              We use your information to run Habita: generating rent invoices and receipts, sending
              transactional emails (reset links, tenant invitations, payment receipts), and providing
              messaging between landlords, staff, and tenants. We do not sell your personal data.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-paper-900">Payments</h2>
            <p className="mt-2">
              Payments made through Habita are processed via Safaricom M-PESA and handled by the
              respective payment providers, who apply their own privacy and security practices.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-paper-900">Security & retention</h2>
            <p className="mt-2">
              Your data is transmitted over encrypted connections and stored on secured servers. We
              keep your records for as long as your account is active, and remove them on request.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-paper-900">Your rights</h2>
            <p className="mt-2">
              You may download or delete your data at any time, and you can close your account from
              your profile settings. For help, or to exercise any of these rights, email{' '}
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