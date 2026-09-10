'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { MyTenantProfile, MyTenantTenancy } from '@/types/tenant';

export const tenantQueryKeys = {
  profiles: ['tenant', 'profiles'] as const,
  dashboard: ['tenant', 'dashboard'] as const,
  charges: ['tenant', 'rent-charges'] as const,
  payments: ['tenant', 'payments'] as const,
  receipts: ['tenant', 'receipts'] as const,
  maintenance: ['tenant', 'maintenance'] as const,
  announcements: ['tenant', 'announcements'] as const,
  conversations: ['tenant', 'conversations'] as const,
  messages: (conversationId: string) => ['tenant', 'conversations', conversationId, 'messages'] as const,
  statement: (tenancyId: string) => ['tenant', 'tenancies', tenancyId, 'statement'] as const,
  deposit: (tenancyId: string) => ['tenant', 'tenancies', tenancyId, 'deposit'] as const,
};

function useTenantProfiles() {
  return useQuery({
    queryKey: tenantQueryKeys.profiles,
    queryFn: () => api.get<MyTenantProfile[]>('/tenants/me/profiles'),
  });
}

export interface TenantPrimary {
  profiles: MyTenantProfile[];
  profile: MyTenantProfile | null;
  tenancy: MyTenantTenancy | null;
  loading: boolean;
}

/**
 * Pick the "live" tenancy to power tenancy-scoped views (ledger, deposit, pay).
 * Prefers an ACTIVE tenancy and falls back to a PENDING one.
 */
export function useTenantPrimary(): TenantPrimary {
  const query = useTenantProfiles();
  const profiles = Array.isArray(query.data) ? query.data : [];
  const profile = profiles.find((p) => (p.tenancies?.length ?? 0) > 0) ?? profiles[0] ?? null;
  const tenancy =
    profile?.tenancies?.find((t) => t.status === 'ACTIVE') ??
    profile?.tenancies?.find((t) => t.status === 'PENDING') ??
    profile?.tenancies?.[0] ??
    null;
  return { profiles, profile, tenancy, loading: query.isLoading };
}

/** Open a raw PDF endpoint (receipts / statements) in a new tab. */
export async function openPdf(path: string): Promise<Blob> {
  const blob = await api.get<Blob>(path);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  return blob;
}