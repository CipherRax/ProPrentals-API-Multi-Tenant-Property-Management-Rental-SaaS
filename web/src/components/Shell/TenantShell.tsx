'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Home, Wallet, ScrollText, ReceiptText, PiggyBank, Wrench, Megaphone,
  MessageSquare, User, LogOut, Menu, X, Building2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { PageLoader } from '@/components/ui/Spinner';
import { initials, cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
}

const tenantNav: NavItem[] = [
  { href: '/portal', label: 'Home', icon: <Home className="h-[18px] w-[18px]" /> },
  { href: '/portal/rent', label: 'My Rent', icon: <Wallet className="h-[18px] w-[18px]" /> },
  { href: '/portal/ledger', label: 'Ledger', icon: <ScrollText className="h-[18px] w-[18px]" /> },
  { href: '/portal/payments', label: 'Payments', icon: <ReceiptText className="h-[18px] w-[18px]" /> },
  { href: '/portal/receipts', label: 'Receipts', icon: <ReceiptText className="h-[18px] w-[18px]" /> },
  { href: '/portal/deposit', label: 'Deposit', icon: <PiggyBank className="h-[18px] w-[18px]" /> },
  { href: '/portal/maintenance', label: 'Maintenance', icon: <Wrench className="h-[18px] w-[18px]" /> },
  { href: '/portal/announcements', label: 'Announcements', icon: <Megaphone className="h-[18px] w-[18px]" /> },
  { href: '/portal/messages', label: 'Messages', icon: <MessageSquare className="h-[18px] w-[18px]" /> },
  { href: '/portal/profile', label: 'Profile', icon: <User className="h-[18px] w-[18px]" /> },
];

export function TenantShell({ children }: { children: ReactNode }) {
  const { loading, user, isTenant, organizations, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isLandlordToo = organizations.length > 0;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace('/login');
    } else if (!isTenant) {
      router.replace(isLandlordToo ? '/dashboard' : '/login');
    }
  }, [loading, user, isTenant, isLandlordToo, router]);

  if (loading) return <PageLoader />;
  if (!user || !isTenant) return null;

  const navigate = () => setMobileOpen(false);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 border-b border-paper-200 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-700 text-white">
          <Home className="h-[18px] w-[18px]" />
        </div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-tight tracking-tightest text-paper-900">
            ProPrentals
          </div>
          <div className="text-[11px] text-paper-400">Tenant portal</div>
        </div>
        <button
          onClick={() => setMobileOpen(false)}
          className="ml-auto rounded-md p-1.5 text-paper-400 hover:bg-paper-200/60 md:hidden"
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <nav className="space-y-0.5">
          {tenantNav.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/portal' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={navigate}
                className={cn('nav-link', active && 'nav-link-active')}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {isLandlordToo && (
          <>
            <div className="my-4 border-t border-paper-200" />
            <Link
              href="/dashboard"
              onClick={navigate}
              className="nav-link"
            >
              <Building2 className="h-[18px] w-[18px]" />
              <span>Owner dashboard</span>
            </Link>
          </>
        )}
      </div>

      <div className="border-t border-paper-200 p-3">
        <div className="flex items-center gap-3 rounded-panel px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-700/10 text-sm font-semibold text-brand-800">
            {user ? initials(`${user.firstName} ${user.lastName}`) : '?'}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-paper-800">
              {user ? `${user.firstName} ${user.lastName}` : '…'}
            </div>
            <div className="truncate text-xs text-paper-400">Tenant</div>
          </div>
          <button
            onClick={() => logout().then(() => (window.location.href = '/login'))}
            className="rounded-md p-1.5 text-paper-400 hover:bg-paper-200/60 hover:text-paper-600"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-paper-200 bg-white md:flex">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-paper-900/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white shadow-card-hover">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-col md:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-paper-200 bg-paper-50/85 px-4 backdrop-blur md:px-8">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-2 text-paper-500 hover:bg-paper-200/60 md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="text-sm text-paper-400">
              Welcome back, <span className="font-medium text-paper-700">{user?.firstName}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a href="/public" className="btn-secondary hidden py-1.5 sm:inline-flex">
              Marketplace
            </a>
            {isLandlordToo && (
              <Link href="/dashboard" className="btn-secondary hidden py-1.5 md:inline-flex">
                Owner dashboard
              </Link>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}