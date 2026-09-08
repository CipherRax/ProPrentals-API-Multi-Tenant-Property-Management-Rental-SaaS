import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AnnouncementAudience, OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../common/utils/audit.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { QueryAnnouncementsDto } from './dto/query-announcements.dto';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER'];

/**
 * Landlord-to-tenant broadcast announcements (spec §26), distinct from
 * one-to-one chat. Targeting is resolved at SEND time rather than stored
 * as a frozen recipient list — "all tenants of property X" means the
 * tenants of property X *right now*, so a tenant who moves in after the
 * announcement is created sees it and one who leaves stops seeing it.
 * Delivery reuses NotificationsService so announcements respect the same
 * per-user ANNOUNCEMENTS preference toggles as every other notification.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  private assertCanManage(role: OrgRole) {
    if (!MANAGE_ROLES.includes(role)) {
      throw new ForbiddenException('Only owners or property managers can publish announcements');
    }
  }

  /** Resolve the audience scope into actual tenant USER ids at send time. */
  private async resolveRecipientIds(
    organizationId: string,
    audience: AnnouncementAudience,
    dto: Pick<CreateAnnouncementDto, 'propertyId' | 'buildingId' | 'unitIds' | 'tenantProfileIds'>,
  ): Promise<string[]> {
    const tenantWhere: Prisma.TenantProfileWhereInput = {
      organizationId,
      status: { not: 'INACTIVE' },
      deletedAt: null,
      userId: { not: null },
    };

    let tenantProfileIds: string[] | null = null;

    switch (audience) {
      case 'ALL_TENANTS': {
        tenantProfileIds = (
          await this.prisma.tenantProfile.findMany({ where: tenantWhere, select: { id: true } })
        ).map((t) => t.id);
        break;
      }
      case 'PROPERTY': {
        if (!dto.propertyId)
          throw new BadRequestException('propertyId is required for a PROPERTY-announcement');
        tenantProfileIds = (
          await this.prisma.tenantProfile.findMany({
            where: {
              ...tenantWhere,
              tenancies: { some: { unit: { propertyId: dto.propertyId } } },
            },
            select: { id: true },
          })
        ).map((t) => t.id);
        break;
      }
      case 'BUILDING': {
        if (!dto.buildingId)
          throw new BadRequestException('buildingId is required for a BUILDING-announcement');
        tenantProfileIds = (
          await this.prisma.tenantProfile.findMany({
            where: {
              ...tenantWhere,
              tenancies: { some: { unit: { buildingId: dto.buildingId } } },
            },
            select: { id: true },
          })
        ).map((t) => t.id);
        break;
      }
      case 'UNITS': {
        if (!dto.unitIds?.length)
          throw new BadRequestException('unitIds are required for a UNITS-announcement');
        tenantProfileIds = (
          await this.prisma.tenantProfile.findMany({
            where: { ...tenantWhere, tenancies: { some: { unitId: { in: dto.unitIds } } } },
            select: { id: true },
          })
        ).map((t) => t.id);
        break;
      }
      case 'TENANTS': {
        if (!dto.tenantProfileIds?.length)
          throw new BadRequestException('tenantProfileIds are required for a TENANTS-announcement');
        tenantProfileIds = dto.tenantProfileIds;
        break;
      }
    }

    if (!tenantProfileIds) return [];

    return (
      await this.prisma.tenantProfile.findMany({
        where: { ...tenantWhere, id: { in: tenantProfileIds } },
        select: { userId: true },
      })
    ).map((t) => t.userId!);
  }

  async create(userId: string, organizationId: string, dto: CreateAnnouncementDto) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);

    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    const isImmediate = !scheduledAt || scheduledAt <= new Date();
    const publishedAt = isImmediate ? new Date() : null;

    const announcement = await this.prisma.announcement.create({
      data: {
        organizationId,
        title: dto.title,
        message: dto.message,
        audience: dto.audience ?? 'ALL_TENANTS',
        createdByUserId: userId,
        propertyId: dto.propertyId,
        buildingId: dto.buildingId,
        unitIds: dto.unitIds ?? [],
        tenantProfileIds: dto.tenantProfileIds ?? [],
        scheduledAt: scheduledAt ?? undefined,
        publishedAt: publishedAt ?? undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'ANNOUNCEMENT_CREATED',
      entityType: 'Announcement',
      entityId: announcement.id,
      newValue: announcement,
    });

    // Immediate announcements fan out to recipients now; scheduled ones
    // are published by the scheduled job when their time arrives.
    if (publishedAt) {
      await this.sendToRecipients(organizationId, announcement);
    }

    return announcement;
  }

  async list(userId: string, organizationId: string, query: QueryAnnouncementsDto) {
    await this.organizations.assertMembership(userId, organizationId);
    const where = { organizationId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        include: { _count: { select: { readStates: true } } },
      }),
      this.prisma.announcement.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async getOne(userId: string, organizationId: string, announcementId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    const announcement = await this.prisma.announcement.findFirst({
      where: { id: announcementId, organizationId },
      include: {
        readStates: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
        },
      },
    });
    if (!announcement) throw new NotFoundException('Announcement not found');
    return announcement;
  }

  // ── Tenant-facing ─────────────────────────────────────────────────

  /** List announcements this tenant can see (targeting resolved per-tenant). */
  async listForTenant(userId: string, page = 1, limit = 20) {
    const now = new Date();
    const tenantProfiles = await this.prisma.tenantProfile.findMany({
      where: { userId, status: { not: 'INACTIVE' }, deletedAt: null },
      select: { id: true, organizationId: true },
    });
    if (!tenantProfiles.length) {
      return buildPaginatedResult([], 0, page, limit);
    }

    const orgIds = [...new Set(tenantProfiles.map((tp) => tp.organizationId))];
    const tenantProfileIds = tenantProfiles.map((tp) => tp.id);

    const where: Prisma.AnnouncementWhereInput = {
      organizationId: { in: orgIds },
      publishedAt: { not: null, lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };

    const [all, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        where,
        skip: paginationSkip(page, limit),
        take: limit,
        orderBy: { publishedAt: 'desc' },
        include: { organization: { select: { name: true, logoUrl: true } } },
      }),
      this.prisma.announcement.count({ where }),
    ]);

    // Re-resolve each announcement's audience against THIS tenant's own
    // profiles/tenancies (same logic as resolveRecipientIds, per-user).
    const visible: typeof all = [];
    for (const a of all) {
      const profileInOrg = tenantProfiles.filter((tp) => tp.organizationId === a.organizationId);
      if (!profileInOrg.length) continue;

      let targeted = false;
      switch (a.audience) {
        case 'ALL_TENANTS':
          targeted = true;
          break;
        case 'PROPERTY': {
          const hit = await this.prisma.tenantProfile.count({
            where: {
              id: { in: profileInOrg.map((p) => p.id) },
              tenancies: { some: { unit: { propertyId: a.propertyId ?? '' } } },
            },
          });
          targeted = hit > 0;
          break;
        }
        case 'BUILDING': {
          const hit = await this.prisma.tenantProfile.count({
            where: {
              id: { in: profileInOrg.map((p) => p.id) },
              tenancies: { some: { unit: { buildingId: a.buildingId ?? '' } } },
            },
          });
          targeted = hit > 0;
          break;
        }
        case 'UNITS': {
          const hit = await this.prisma.tenantProfile.count({
            where: {
              id: { in: profileInOrg.map((p) => p.id) },
              tenancies: { some: { unitId: { in: a.unitIds } } },
            },
          });
          targeted = hit > 0;
          break;
        }
        case 'TENANTS':
          targeted = a.tenantProfileIds.some((id) => tenantProfileIds.includes(id));
          break;
      }
      if (targeted) visible.push(a);
    }

    // Mark everything in this visible page as read (best effort).
    await Promise.all(
      visible.map((a) =>
        this.prisma.announcementReadState.upsert({
          where: { announcementId_userId: { announcementId: a.id, userId } },
          update: {},
          create: { announcementId: a.id, userId, readAt: new Date() },
        }),
      ),
    );

    return buildPaginatedResult(visible, total, page, limit);
  }

  async getForTenant(userId: string, announcementId: string) {
    const announcement = await this.prisma.announcement.findFirst({
      where: { id: announcementId, publishedAt: { not: null } },
    });
    if (!announcement) throw new NotFoundException('Announcement not found');

    await this.prisma.announcementReadState.upsert({
      where: { announcementId_userId: { announcementId, userId } },
      update: { readAt: new Date() },
      create: { announcementId, userId, readAt: new Date() },
    });
    return announcement;
  }

  // ── Shared internals ──────────────────────────────────────────────

  /** Called after commit for immediate announcements and by the cron for scheduled ones. */
  async sendToRecipients(
    organizationId: string,
    announcement: {
      id: string;
      title: string;
      message: string;
      audience: AnnouncementAudience;
      propertyId: string | null;
      buildingId: string | null;
      unitIds: string[];
      tenantProfileIds: string[];
    },
  ) {
    const userIds = await this.resolveRecipientIds(organizationId, announcement.audience, {
      propertyId: announcement.propertyId ?? undefined,
      buildingId: announcement.buildingId ?? undefined,
      unitIds: announcement.unitIds,
      tenantProfileIds: announcement.tenantProfileIds,
    });

    if (!userIds.length) return;

    const recipients = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, phone: true },
    });

    // Fan-out is deliberately best-effort and post-commit so a slow
    // email/SMS loop can never hold the announcement transaction open.
    for (const recipient of recipients) {
      await this.notifications.dispatch({
        recipientUserId: recipient.id,
        organizationId,
        type: 'NEW_ANNOUNCEMENT',
        title: announcement.title,
        body: announcement.message.slice(0, 500),
        data: { announcementId: announcement.id },
        email: recipient.email,
        phone: recipient.phone ?? undefined,
      });
    }
  }

  /** Publishes scheduled announcements whose time has come (cron). */
  async publishDueScheduled(now = new Date()) {
    const due = await this.prisma.announcement.findMany({
      where: { publishedAt: null, scheduledAt: { lte: now } },
    });
    for (const announcement of due) {
      await this.prisma.announcement.update({
        where: { id: announcement.id },
        data: { publishedAt: announcement.scheduledAt ?? now },
      });
      await this.sendToRecipients(announcement.organizationId, announcement);
    }
    return due.length;
  }
}
