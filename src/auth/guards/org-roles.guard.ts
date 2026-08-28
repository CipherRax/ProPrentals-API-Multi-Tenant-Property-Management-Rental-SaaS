import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgRole } from '@prisma/client';
import { ORG_ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedUser } from '../types/authenticated-user.interface';

// Enforces organization-scoped RBAC. Requires JwtAccessGuard to have run
// first so request.user.activeOrganizationId/activeOrgRole are populated
// from a verified OrganizationMember row — never from client input.
@Injectable()
export class OrgRolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<OrgRole[]>(ORG_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;

    if (!user?.activeOrganizationId || !user.activeOrgRole) {
      throw new ForbiddenException('No active organization context');
    }
    if (!requiredRoles.includes(user.activeOrgRole)) {
      throw new ForbiddenException('Insufficient organization role');
    }
    return true;
  }
}
