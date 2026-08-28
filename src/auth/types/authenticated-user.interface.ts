import { OrgRole, PlatformRole } from '@prisma/client';

// The shape attached to `request.user` after JWT validation.
// activeOrganizationId/activeOrgRole are resolved server-side from the
// OrganizationMember table — never accepted from client input.
export interface AuthenticatedUser {
  userId: string;
  email: string;
  platformRole: PlatformRole | null;
  activeOrganizationId: string | null;
  activeOrgRole: OrgRole | null;
}
