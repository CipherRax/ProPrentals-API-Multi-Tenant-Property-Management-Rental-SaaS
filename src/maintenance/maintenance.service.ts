import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../common/utils/audit.service';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';
import { CreateMaintenanceRequestDto } from './dto/create-maintenance-request.dto';
import { UpdateMaintenanceStatusDto } from './dto/update-maintenance-status.dto';
import { QueryMaintenanceDto } from './dto/query-maintenance.dto';

const STAFF_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER', 'CARETAKER', 'STAFF'];

/**
 * Maintenance requests (spec §24): tenants submit them against their own
 * unit; landlord/staff triage, assign, resolve. The status transition
 * boundary here is deliberate: only the staff-facing endpoint may move
 * a request between states; a tenant can update their request's details
 * but never flip its status (spec §74's state-machine principle).
 */
@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  // ── Tenant-facing ─────────────────────────────────────────────────

  async createForTenant(userId: string, dto: CreateMaintenanceRequestDto) {
    // Verify the unit belongs to an organization this tenant is actually
    // a profile of, so a tenant can't file requests against other
    // people's or other orgs' units.
    const profile = await this.prisma.tenantProfile.findFirst({
      where: { userId, status: { not: 'INACTIVE' }, deletedAt: null },
    });
    if (!profile) throw new NotFoundException('You are not registered as a tenant');

    // Maintenance is a gated plan feature (spec §34/§59).
    if (!(await this.subscriptions.isFeatureEnabled(profile.organizationId, 'maintenance'))) {
      throw new ForbiddenException(
        'Maintenance requests are a paid feature — your landlord needs to upgrade their subscription plan',
      );
    }

    const unit = await this.prisma.unit.findFirst({
      where: {
        id: dto.unitId,
        propertyId: dto.propertyId,
        property: { organizationId: profile.organizationId },
      },
    });
    if (!unit) throw new NotFoundException('Unit not found in your tenancy');

    const request = await this.prisma.maintenanceRequest.create({
      data: {
        organizationId: profile.organizationId,
        propertyId: dto.propertyId,
        unitId: dto.unitId,
        tenantUserId: userId,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        priority: dto.priority ?? 'MEDIUM',
      },
    });

    await this.audit.log({
      organizationId: profile.organizationId,
      actorUserId: userId,
      action: 'MAINTENANCE_REQUEST_CREATED',
      entityType: 'MaintenanceRequest',
      entityId: request.id,
      newValue: request,
    });

    await this.notifyOrg(
      request.organizationId,
      'MAINTENANCE_CREATED',
      'New maintenance request',
      `${dto.title} — ${dto.description}`.slice(0, 500),
      { requestId: request.id },
    );
    return request;
  }

  async listMyRequests(userId: string, query: QueryMaintenanceDto) {
    const where: Prisma.MaintenanceRequestWhereInput = {
      tenantUserId: userId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.category ? { category: query.category } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.maintenanceRequest.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { unit: { select: { unitNumber: true, property: { select: { name: true } } } } },
      }),
      this.prisma.maintenanceRequest.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async getMyRequest(userId: string, requestId: string) {
    const request = await this.prisma.maintenanceRequest.findFirst({
      where: { id: requestId, tenantUserId: userId },
      include: { unit: { select: { unitNumber: true, property: { select: { name: true } } } } },
    });
    if (!request) throw new NotFoundException('Maintenance request not found');
    return request;
  }

  // ── Staff/landlord-facing ─────────────────────────────────────────

  async listForOrg(userId: string, organizationId: string, query: QueryMaintenanceDto) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!STAFF_ROLES.includes(membership.role)) {
      throw new ForbiddenException('You do not have access to maintenance requests');
    }
    const where: Prisma.MaintenanceRequestWhereInput = { organizationId };
    if (query.status) where.status = query.status;
    if (query.category) where.category = query.category;
    if (query.propertyId) where.propertyId = query.propertyId;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.maintenanceRequest.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: {
          tenant: { select: { firstName: true, lastName: true } },
          assignedTo: { select: { firstName: true, lastName: true } },
          unit: { select: { unitNumber: true, property: { select: { name: true } } } },
          attachments: true,
        },
      }),
      this.prisma.maintenanceRequest.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async getForOrg(userId: string, organizationId: string, requestId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!STAFF_ROLES.includes(membership.role)) {
      throw new ForbiddenException('You do not have access to maintenance requests');
    }
    const request = await this.prisma.maintenanceRequest.findFirst({
      where: { id: requestId, organizationId },
      include: {
        tenant: { select: { firstName: true, lastName: true, email: true, phone: true } },
        assignedTo: { select: { firstName: true, lastName: true } },
        unit: { select: { unitNumber: true, property: { select: { name: true } } } },
        attachments: true,
      },
    });
    if (!request) throw new NotFoundException('Maintenance request not found');
    return request;
  }

  /**
   * The only place a request's status changes (spec §74). RESOLVED/CLOSED
   * record the resolution and its timestamp; assigning captures the staff
   * member. Moving to RESOLVED/CLOSED/CANCELLED notifies the tenant.
   */
  async updateStatus(
    userId: string,
    organizationId: string,
    requestId: string,
    dto: UpdateMaintenanceStatusDto,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!STAFF_ROLES.includes(membership.role)) {
      throw new ForbiddenException('You do not have access to maintenance requests');
    }
    const request = await this.prisma.maintenanceRequest.findFirst({
      where: { id: requestId, organizationId },
    });
    if (!request) throw new NotFoundException('Maintenance request not found');

    const isTerminal = ['RESOLVED', 'CLOSED', 'CANCELLED'].includes(dto.status);
    const resolvedAt = isTerminal ? new Date() : null;

    const data: Prisma.MaintenanceRequestUpdateInput = {
      status: dto.status,
      ...(dto.assignedToUserId ? { assignedTo: { connect: { id: dto.assignedToUserId } } } : {}),
      ...(dto.resolution !== undefined ? { resolution: dto.resolution ?? undefined } : {}),
      ...(resolvedAt ? { resolvedAt } : {}),
    };

    const updated = await this.prisma.maintenanceRequest.update({ where: { id: requestId }, data });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'MAINTENANCE_REQUEST_UPDATED',
      entityType: 'MaintenanceRequest',
      entityId: requestId,
      previousValue: request,
      newValue: updated,
    });

    if (request.tenantUserId) {
      const tenant = await this.prisma.user.findUnique({
        where: { id: request.tenantUserId },
        select: { email: true, phone: true },
      });
      await this.notifications.dispatch({
        recipientUserId: request.tenantUserId,
        organizationId,
        type: 'MAINTENANCE_UPDATED',
        title: `Maintenance update: ${dto.status.replaceAll('_', ' ').toLowerCase()}`,
        body: dto.resolution ?? dto.status,
        data: { requestId },
        email: tenant?.email,
        phone: tenant?.phone ?? undefined,
      });
    }

    return updated;
  }

  async addAttachment(
    userId: string,
    organizationId: string,
    requestId: string,
    url: string,
    caption?: string,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!STAFF_ROLES.includes(membership.role)) {
      throw new ForbiddenException('You do not have access to maintenance requests');
    }
    await this.prisma.maintenanceRequest
      .findFirst({ where: { id: requestId, organizationId } })
      .then((r) => {
        if (!r) throw new NotFoundException('Maintenance request not found');
      });
    return this.prisma.maintenanceAttachment.create({ data: { requestId, url, caption } });
  }

  private async notifyOrg(
    organizationId: string,
    type: 'MAINTENANCE_CREATED',
    title: string,
    body: string,
    data: Record<string, unknown>,
  ) {
    const owner = await this.prisma.organizationMember.findFirst({
      where: { organizationId, role: 'OWNER', isActive: true },
      include: { user: { select: { id: true, email: true, phone: true } } },
    });
    if (!owner) return;
    await this.notifications.dispatch({
      recipientUserId: owner.userId,
      organizationId,
      type,
      title,
      body,
      data,
      email: owner.user.email,
      phone: owner.user.phone ?? undefined,
    });
  }
}
