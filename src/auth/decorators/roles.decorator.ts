import { SetMetadata } from '@nestjs/common';
import { OrgRole } from '@prisma/client';

export const ORG_ROLES_KEY = 'orgRoles';

// Restrict an endpoint to specific organization-scoped roles, e.g.
// @OrgRoles(OrgRole.OWNER, OrgRole.PROPERTY_MANAGER)
export const OrgRoles = (...roles: OrgRole[]) => SetMetadata(ORG_ROLES_KEY, roles);
