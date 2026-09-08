'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import React, { type ReactNode } from 'react';
import {
  LayoutDashboard,
  Building2,
  Users,
  ReceiptText,
  Wallet,
  Bell,
  MessageSquare,
  Megaphone,
  Wrench,
  Shield,
  FileBarChart,
  CreditCard,
  ScrollText,
  Home,
  LogOut,
  Sun,
  Database,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import type { OrgRole } from '@/types';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  roles?: OrgRole[];
  platform?: boolean;
}

const landlordNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/properties', label: 'Properties', icon: <Building2 className="h-4 w-4" /> },
  { href: '/tenants', label: 'Tenants', icon: <Users className="h-4 w-4" /> },
  { href: '/rent', label: 'Rent & Charges', icon: <Wallet className="h-4 w-4" /> },
  { href: '/payments', label: 'Payments', icon: <CreditCard className="h-4 w-4" /> },
  { href: '/receipts', label: 'Receipts', icon: <ReceiptText className="h-4 w-4" /> },
  { href: '/announcements', label: 'Announcements', icon: <Megaphone className="h-4 w-4" /> },
  { href: '/maintenance', label: 'Maintenance', icon: <Wrench className="h-4 w-4" /> },
  { href: '/messages', label: 'Messages', icon: <MessageSquare className="h-4 w-4" /> },
  { href: '/reports', label: 'Reports', icon: <FileBarChart className="h-4 w-4" /> },
  { href: '/subscription', label: 'Subscription', icon: <Shield className="h-4 w-4" /> },
  { href: '/inquiries', label: 'Inquiries', icon: <ScrollText className="h-4 w-4" /> },
];

const platformNav: NavItem[] = [
  {
    href: '/admin',
    label: 'Admin Console',
    icon: <Database className="h-4 w-4" />,
    platform: true,
  },
];

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, organizations, activeOrg, setActiveOrg, logout } = useAuth();

  const isPlatformAdmin =
    user?.platformRole === 'SUPER_ADMIN' || user?.platformRole === 'SUPPORT_ADMIN';

  const shown = isPlatformAdmin ? [...landlordNav, ...platformNav] : landlordNav;

  return (
    <div className="flex min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-ink-100 bg-surface">
        <div className="flex h-16 items-center gap-2.5 border-b border-ink-100 px-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 text-white">
            <Home className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-ink-900">ProPrentals</div>
            <div className="text-[11px] text-ink-400">Rental Management</div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-4">
          {organizations.length > 0 && activeOrg && (
            <div className="mb-4 px-1">
              <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-ink-400">
                Organization
              </label>
              <select
                value={activeOrg.id}
                onChange={(e) => setActiveOrg(e.target.value)}
                className="input py-1.5 text-sm"
              >
                {organizations.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <nav className="space-y-0.5">
            {shown.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== '/properties' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-link ${active ? 'nav-link-active' : ''}`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-ink-100 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-800">
              {user ? initials(`${user.firstName} ${user.lastName}`) : '?'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-ink-800">
                {user ? `${user.firstName} ${user.lastName}` : '…'}
              </div>
              <div className="truncate text-xs text-ink-400">
                {activeOrg?.myRole ? myRoleLabel(activeOrg.myRole) : user?.email}
              </div>
            </div>
            <button
              onClick={() => logout().then(() => (window.location.href = '/login'))}
              className="rounded-md p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-600"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="ml-64 flex-1">
        <TopBar />
        <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
      </main>
    </div>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-ink-100 bg-[#f4f5f7]/80 px-6 backdrop-blur">
      <div className="text-sm text-ink-400">
        <Sun className="mr-2 inline h-4 w-4 text-accent-500" />
        Welcome back
      </div>
      <div className="flex items-center gap-3">
        <Link
          href="/notifications"
          className="relative rounded-lg border border-ink-100 bg-surface p-2 text-ink-500 shadow-card hover:text-ink-700"
        >
          <Bell className="h-4 w-4" />
        </Link>
        <Link href="/public" className="btn-secondary py-1.5">
          Marketplace
        </Link>
      </div>
    </header>
  );
}

function myRoleLabel(role: OrgRole): string {
  return role.toLowerCase().replace(/_/g, ' ');
}
