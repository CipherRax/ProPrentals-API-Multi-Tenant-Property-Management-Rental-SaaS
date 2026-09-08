import type { OrgRole, OrganizationWithRole } from '@/types';

/** Resolve the current org role from the organization list + active org id. */
export function findOrgRole(
  organizations: OrganizationWithRole[],
  activeOrgId?: string | null,
): OrgRole | undefined {
  return organizations.find((o) => o.id === activeOrgId)?.myRole;
}
