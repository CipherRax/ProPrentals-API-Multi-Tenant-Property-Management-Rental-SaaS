'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import {
  LayoutDashboard, Building2, Users, Wallet, CreditCard, ReceiptText,
  Wrench, MessageSquare, Megaphone, ScrollText, FileBarChart, Shield,
  Gem, Home, LogOut, Bell, Menu, X, Building,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { canAny, type Permission } from '@/lib/rbac';
import { useUnreadCount } from '@/hooks/useNotifications';
import type { OrgRole } from '@/types';
import { initials } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  permissions: Permission[];
}

const landlordNav: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-[18px] w-[18px]" />, permissions: ['property:read'] },
  { href: '/properties', label: 'Properties', icon: <Building2 className="h-[18px] w-[18px]" />, permissions: ['property:create', 'property:read'] },
  { href: '/tenants', label: 'Tenants', icon: <Users className="h-[18px] w-[18px]" />, permissions: ['tenant:create', 'tenant:read'] },
  { href: '/rent', label: 'Rent', icon: <Wallet className="h-[18px] w-[18px]" />, permissions: ['rent:read'] },
  { href: '/payments', label: 'Payments', icon: <CreditCard className="h-[18px] w-[18px]" />, permissions: ['payment:create', 'payment:read'] },
  { href: '/receipts', label: 'Receipts', icon: <ReceiptText className="h-[18px] w-[18px]" />, permissions: ['receipt:read'] },
  { href: '/maintenance', label: 'Maintenance', icon: <Wrench className="h-[18px] w-[18px]" />, permissions: ['maintenance:read'] },
  { href: '/messages', label: 'Messages', icon: <MessageSquare className="h-[18px] w-[18px]" />, permissions: ['message:view'] },
  { href: '/announcements', label: 'Announcements', icon: <Megaphone className="h-[18px] w-[18px]" />, permissions: ['announcement:create', 'announcement:read'] },
  { href: '/inquiries', label: 'Inquiries', icon: <ScrollText className="h-[18px] w-[18px]" />, permissions: ['inquiry:read'] },
  { href: '/reports', label: 'Reports', icon: <FileBarChart className="h-[18px] w-[18px]" />, permissions: ['report:read'] },
  { href: '/staff', label: 'Staff', icon: <Shield className="h-[18px] w-[18px]" />, permissions: ['staff:manage'] },
  { href: '/subscription', label: 'Subscription', icon: <Gem className="h-[18px] w-[18px]" />, permissions: ['subscription:manage'] },
];

function shouldShow(item: NavItem, role?: OrgRole): boolean {
  if (!role) return false;
  return canAny(role, item.permissions);
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, organizations, activeOrg, setActiveOrg, logout } = useAuth();
  const unread = useUnreadCount();

  const isPlatformAdmin =
    user?.platformRole === 'SUPER_ADMIN' || user?.platformRole === 'SUPPORT_ADMIN';

  const role = activeOrg?.myRole;

  const visible = landlordNav.filter((i) => shouldShow(i, role));
  const homeFor = isPlatformAdmin
    ? '/admin'
    : role === 'CARETAKER'
      ? '/maintenance'
      : '/dashboard';

  const navigate = (href: string) => {
    setMobileOpen(false);
  };

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
          <div className="text-[11px] text-paper-400">Rental Management</div>
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
        {organizations.length > 0 && (
          <div className="mb-4 px-1">
            <label className="mb-1.5 block px-1 text-2xs font-semibold uppercase tracking-wide text-paper-400">
              Organization
            </label>
            <select
              value={activeOrg?.id ?? ''}
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
          {visible.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => navigate(item.href)}
                className={cn('nav-link', active && 'nav-link-active')}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {isPlatformAdmin && (
          <>
            <div className="my-4 border-t border-paper-200" />
            <Link
              href="/admin"
              onClick={() => navigate('/admin')}
              className={cn('nav-link', pathname.startsWith('/admin') && 'nav-link-active')}
            >
              <Building className="h-[18px] w-[18px]" />
              <span>Platform Admin</span>
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
            <div className="truncate text-xs text-paper-400">
              {role ? roleLabel(role) : user?.email}
            </div>
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
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-paper-200 bg-white md:flex">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
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
            <a
              href="/public"
              className="btn-secondary hidden py-1.5 sm:inline-flex"
            >
              Marketplace
            </a>
            <Link
              href="/notifications"
              className="relative rounded-md border border-paper-200 bg-white p-2 text-paper-500 hover:text-paper-700"
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" />
              {unread > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </Link>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-8 md:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function roleLabel(role: OrgRole): string {
  return role.toLowerCase().replace(/_/g, ' ');
}
