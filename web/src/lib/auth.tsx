'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useMemo,
  type ReactNode,
} from 'react';
import { api, ApiError } from '@/lib/api';
import type { CurrentUser, OrganizationWithRole, OrgRole } from '@/types';
import type { MyTenantProfile } from '@/types/tenant';

interface AuthPayload {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone?: string | null;
    avatarUrl?: string | null;
    platformRole: string;
    status: string;
  };
  accessToken: string;
  refreshToken: string;
  organization?: { id: string; name: string; slug: string };
}

interface AuthContextValue {
  user: CurrentUser | null;
  organizations: OrganizationWithRole[];
  activeOrg: OrganizationWithRole | null;
  isTenant: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<string>;
  register: (data: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    organizationName: string;
  }) => Promise<string>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  refreshOrganizations: () => Promise<void>;
  setActiveOrg: (orgId: string) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationWithRole[]>([]);
  const [activeOrg, setActiveOrgState] = useState<OrganizationWithRole | null>(null);
  const [isTenant, setIsTenant] = useState(false);
  const [loading, setLoading] = useState(true);

  /**
   * A user counts as a tenant when they hold at least one TenantProfile with an
   * ACTIVE or PENDING tenancy. The /tenants/me/profiles endpoint already filters
   * its `tenancies` include to those statuses.
   */
  const loadTenantStatus = useCallback(async (): Promise<boolean> => {
    try {
      const data = await api.get<MyTenantProfile[]>('/tenants/me/profiles');
      const profiles = Array.isArray(data) ? data : [];
      const active = profiles.some((p) => (p.tenancies?.length ?? 0) > 0);
      setIsTenant(active);
      return active;
    } catch {
      setIsTenant(false);
      return false;
    }
  }, []);

  const loadOrganizations = useCallback(async (): Promise<OrganizationWithRole[]> => {
    const data = await api.get<OrganizationWithRole[]>('/organizations/me');
    const orgs = Array.isArray(data) ? data : [];
    setOrganizations(orgs);

    const storedActive = typeof window !== 'undefined' ? localStorage.getItem('pp.org') : null;
    const current = orgs.find((o) => o.id === storedActive) ?? orgs[0] ?? null;
    setActiveOrgState(current);
    if (current && typeof window !== 'undefined') localStorage.setItem('pp.org', current.id);
    return orgs;
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await api.get<CurrentUser>('/users/me');
    setUser(me);
  }, []);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        if (!api.isAuthenticated()) {
          setLoading(false);
          return;
        }
        await refreshUser();
        await loadOrganizations();
        await loadTenantStatus();
      } catch {
        if (mounted) api.clearTokens();
      } finally {
        if (mounted) setLoading(false);
      }
    }
    bootstrap();
    return () => {
      mounted = false;
    };
  }, [refreshUser, loadOrganizations, loadTenantStatus]);

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api.post<AuthPayload>('/auth/login', { email, password });
      api.setTokens(data.accessToken, data.refreshToken);
      await refreshUser();
      const orgs = await loadOrganizations();
      const tenantState = await loadTenantStatus();
      return orgs.length > 0 ? '/dashboard' : tenantState ? '/portal' : '/dashboard';
    },
    [refreshUser, loadOrganizations, loadTenantStatus],
  );

  const register = useCallback(
    async (data: {
      firstName: string;
      lastName: string;
      email: string;
      password: string;
      organizationName: string;
    }) => {
      const res = await api.post<AuthPayload>('/auth/register', data);
      api.setTokens(res.accessToken, res.refreshToken);
      await refreshUser();
      await loadOrganizations();
      await loadTenantStatus();
      return '/dashboard';
    },
    [refreshUser, loadOrganizations, loadTenantStatus],
  );

  const logout = useCallback(async () => {
    const refreshToken = api.refreshToken;
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch {
      /* ignore */
    }
    api.clearTokens();
    setUser(null);
    setOrganizations([]);
    setActiveOrgState(null);
    setIsTenant(false);
  }, []);

  const setActiveOrg = useCallback(
    (orgId: string) => {
      const next = organizations.find((o) => o.id === orgId) ?? null;
      setActiveOrgState(next);
      if (next) localStorage.setItem('pp.org', next.id);
    },
    [organizations],
  );

  const value = useMemo(
    () => ({
      user,
      organizations,
      activeOrg,
      isTenant,
      loading,
      login,
      register,
      logout,
      refreshUser,
      refreshOrganizations: async () => {
        await loadOrganizations();
      },
      setActiveOrg,
    }),
    [user, organizations, activeOrg, isTenant, loading, login, register, logout, refreshUser, loadOrganizations, setActiveOrg],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function isError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

export function getErrorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong. Please try again.';
}

export function can(role: OrgRole | undefined, ...roles: OrgRole[]): boolean {
  return !!role && roles.includes(role);
}
