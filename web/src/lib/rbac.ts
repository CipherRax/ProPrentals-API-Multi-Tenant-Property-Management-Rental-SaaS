import type { OrgRole } from '@/types';

/**
 * Granular permission set mirroring the backend's own trust boundary.
 * A caretaker should never see financial screens; an accountant should
 * never manage property CRUD — this is not just a top-level role gate.
 */
export type Permission =
  | 'property:create'
  | 'property:read'
  | 'property:update'
  | 'property:delete'
  | 'tenant:create'
  | 'tenant:read'
  | 'tenant:update'
  | 'tenant:invite'
  | 'tenancy:manage'
  | 'rent:read'
  | 'rent:manage'
  | 'payment:create'
  | 'payment:read'
  | 'payment:refund'
  | 'receipt:read'
  | 'report:read'
  | 'message:view'
  | 'message:send'
  | 'announcement:create'
  | 'announcement:read'
  | 'maintenance:create'
  | 'maintenance:update'
  | 'maintenance:read'
  | 'inquiry:read'
  | 'inquiry:update'
  | 'staff:manage'
  | 'subscription:manage'
  | 'listing:manage';

/**
 * Role → permission matrix. New roles added on the backend only require
 * updating this one table.
 */
const ROLE_PERMISSIONS: Record<OrgRole, Permission[]> = {
  OWNER: [
    'property:create', 'property:read', 'property:update', 'property:delete',
    'tenant:create', 'tenant:read', 'tenant:update', 'tenant:invite',
    'tenancy:manage', 'rent:read', 'rent:manage',
    'payment:create', 'payment:read', 'payment:refund', 'receipt:read', 'report:read',
    'message:view', 'message:send',
    'announcement:create', 'announcement:read',
    'maintenance:create', 'maintenance:update', 'maintenance:read',
    'inquiry:read', 'inquiry:update', 'staff:manage', 'subscription:manage', 'listing:manage',
  ],
  PROPERTY_MANAGER: [
    'property:create', 'property:read', 'property:update', 'property:delete',
    'tenant:create', 'tenant:read', 'tenant:update', 'tenant:invite',
    'tenancy:manage', 'rent:read', 'rent:manage',
    'payment:create', 'payment:read', 'receipt:read', 'report:read',
    'message:view', 'message:send',
    'announcement:create', 'announcement:read',
    'maintenance:create', 'maintenance:update', 'maintenance:read',
    'inquiry:read', 'inquiry:update', 'staff:manage', 'listing:manage',
  ],
  ACCOUNTANT: [
    'tenant:read',
    'rent:read', 'rent:manage',
    'payment:create', 'payment:read', 'payment:refund', 'receipt:read', 'report:read',
    'message:view',
    'announcement:read',
    'maintenance:read',
  ],
  CARETAKER: [
    'property:read', 'tenant:read',
    'message:view', 'message:send',
    'announcement:read',
    'maintenance:create', 'maintenance:update', 'maintenance:read',
  ],
  STAFF: [
    'property:read',
    'tenant:read',
    'rent:read',
    'payment:read',
    'receipt:read',
    'message:view', 'message:send',
    'announcement:read',
    'maintenance:create', 'maintenance:update', 'maintenance:read',
    'inquiry:read',
  ],
};

export function rolePermissions(role?: OrgRole | null): Permission[] {
  if (!role) return [];
  return ROLE_PERMISSIONS[role] ?? [];
}

export function can(
  role: OrgRole | undefined | null,
  permission: Permission,
): boolean {
  return rolePermissions(role).includes(permission);
}

export function canAny(
  role: OrgRole | undefined | null,
  permissions: Permission[],
): boolean {
  const perms = rolePermissions(role);
  return permissions.some((p) => perms.includes(p));
}

/* ---- Route-level definitions ----------------------------------------- */

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  /** At least one of these permissions is required to see the route. */
  permissions: Permission[];
  /** Market value separator — never an arbitrary tracked-out eyebrow. */
}

/** Permission requirements for each org-side route. */
export const PAGE_PERMISSIONS: Record<string, Permission[]> = {
  '/dashboard': ['property:read'],
  '/properties': ['property:read'],
  '/tenants': ['tenant:read'],
  '/rent': ['rent:read'],
  '/payments': ['payment:read'],
  '/receipts': ['receipt:read'],
  '/announcements': ['announcement:read'],
  '/maintenance': ['maintenance:read'],
  '/messages': ['message:view'],
  '/reports': ['report:read'],
  '/subscription': ['subscription:manage'],
  '/inquiries': ['inquiry:read'],
  '/settings': ['property:read'],
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'layout-dashboard', permissions: ['property:read'] },
  { href: '/properties', label: 'Properties', icon: 'building-2', permissions: ['property:read'] },
  { href: '/tenants', label: 'Tenants', icon: 'users', permissions: ['tenant:read'] },
  { href: '/rent', label: 'Rent', icon: 'wallet', permissions: ['rent:read'] },
  { href: '/payments', label: 'Payments', icon: 'credit-card', permissions: ['payment:read'] },
  { href: '/receipts', label: 'Receipts', icon: 'receipt-text', permissions: ['receipt:read'] },
  { href: '/maintenance', label: 'Maintenance', icon: 'wrench', permissions: ['maintenance:read'] },
  { href: '/messages', label: 'Messages', icon: 'message-square', permissions: ['message:view'] },
  { href: '/announcements', label: 'Announcements', icon: 'megaphone', permissions: ['announcement:read'] },
  { href: '/inquiries', label: 'Inquiries', icon: 'scroll-text', permissions: ['inquiry:read'] },
  { href: '/reports', label: 'Reports', icon: 'file-bar-chart', permissions: ['report:read'] },
  { href: '/staff', label: 'Staff', icon: 'shield', permissions: ['staff:manage'] },
  { href: '/subscription', label: 'Subscription', icon: 'gem', permissions: ['subscription:manage'] },
];

export function pageAllowed(role: OrgRole | undefined | null, pathname: string): boolean {
  const required = PAGE_PERMISSIONS[pathname];
  if (!required) return true;
  return canAny(role, required);
}
