import { Injectable, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';

/**
 * Read-side access to the append-only AuditLog (spec §38). No write
 * paths here — AuditService.log is the only way in and audit logs can
 * never be mutated after the fact.
 */
@Injectable()
export class AuditQueryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
  ) {}

  async listForOrganization(
    userId: string,
    organizationId: string,
    query: {
      page?: number;
      limit?: number;
      actorUserId?: string;
      entityType?: string;
      action?: string;
    },
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!['OWNER', 'PROPERTY_MANAGER'].includes(membership.role)) {
      throw new ForbiddenException('Only owners and property managers can view the audit log');
    }

    const where: Prisma.AuditLogWhereInput = { organizationId };
    if (query.actorUserId) where.actorUserId = query.actorUserId;
    if (query.entityType) where.entityType = query.entityType;
    if (query.action) where.action = query.action;

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 25, 100);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          actor: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getOne(userId: string, organizationId: string, auditLogId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!['OWNER', 'PROPERTY_MANAGER'].includes(membership.role)) {
      throw new ForbiddenException('Only owners and property managers can view the audit log');
    }

    const entry = await this.prisma.auditLog.findFirst({
      where: { id: auditLogId, organizationId },
      include: { actor: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    if (!entry) {
      throw new ForbiddenException('Audit log entry not found in this organization');
    }
    return entry;
  }

  /** Platform admin: view any organization's audit log. */
  async listAnyOrganizationAudit(
    adminId: string,
    organizationId: string,
    query: { page?: number; limit?: number },
  ) {
    const isPlatformAdmin = await this.isPlatformAdmin(adminId);
    if (!isPlatformAdmin) {
      throw new ForbiddenException('Platform admins only');
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 50, 200);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          actor: { select: { id: true, email: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.auditLog.count({ where: { organizationId } }),
    ]);

    return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  private async isPlatformAdmin(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, platformRole: true },
    });
    return user?.platformRole === 'SUPER_ADMIN' || user?.platformRole === 'SUPPORT_ADMIN';
  }
}
