import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../common/utils/audit.service';
import { StorageService } from '../storage/storage.service';
import { QueryTenantsDto } from './dto/query-tenants.dto';
import { UpdateMyTenantProfileDto } from './dto/update-my-tenant-profile.dto';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  // ── Landlord-facing: tenant directory for an organization ──────────

  async findAll(userId: string, organizationId: string, query: QueryTenantsDto) {
    await this.organizations.assertMembership(userId, organizationId);

    const where: Prisma.TenantProfileWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { fullName: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
              { phone: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.tenantProfile.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { createdAt: query.sortOrder },
        include: {
          tenancies: {
            where: { status: { in: ['ACTIVE', 'PENDING'] } },
            include: { unit: { select: { id: true, unitNumber: true, propertyId: true } } },
          },
        },
      }),
      this.prisma.tenantProfile.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async findOne(userId: string, organizationId: string, tenantProfileId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    return this.getOwnedTenantProfile(organizationId, tenantProfileId, {
      tenancies: {
        orderBy: { createdAt: 'desc' },
        include: { unit: { select: { id: true, unitNumber: true, propertyId: true } } },
      },
    });
  }

  async deactivate(userId: string, organizationId: string, tenantProfileId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (membership.role !== 'OWNER' && membership.role !== 'PROPERTY_MANAGER') {
      throw new ForbiddenException('Only owners or property managers can deactivate tenants');
    }
    const profile = await this.getOwnedTenantProfile(organizationId, tenantProfileId);

    const activeTenancy = await this.prisma.tenancy.findFirst({
      where: { tenantProfileId, status: { in: ['ACTIVE', 'PENDING'] } },
    });
    if (activeTenancy) {
      throw new ForbiddenException(
        'This tenant has an active or pending tenancy. Terminate the tenancy first.',
      );
    }

    const updated = await this.prisma.tenantProfile.update({
      where: { id: tenantProfileId },
      data: { status: 'INACTIVE' },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'TENANT_DEACTIVATED',
      entityType: 'TenantProfile',
      entityId: tenantProfileId,
      previousValue: profile,
      newValue: updated,
    });

    return updated;
  }

  // ── Tenant-facing self-service (no OrganizationMember involved) ────

  async getMyProfiles(userId: string) {
    // A tenant User may hold a TenantProfile in more than one
    // organization over time (different landlords) — return all of them,
    // each already scoped to its own org by construction.
    return this.prisma.tenantProfile.findMany({
      where: { userId, deletedAt: null },
      include: {
        organization: { select: { id: true, name: true, logoUrl: true } },
        tenancies: {
          where: { status: { in: ['ACTIVE', 'PENDING'] } },
          include: { unit: { select: { id: true, unitNumber: true, propertyId: true } } },
        },
      },
    });
  }

  async updateMyProfile(userId: string, tenantProfileId: string, dto: UpdateMyTenantProfileDto) {
    const profile = await this.prisma.tenantProfile.findFirst({
      where: { id: tenantProfileId, userId, deletedAt: null },
    });
    if (!profile) throw new NotFoundException('Tenant profile not found');

    return this.prisma.tenantProfile.update({
      where: { id: tenantProfileId },
      data: dto,
    });
  }

  async uploadMyProfileAvatar(userId: string, tenantProfileId: string, file: Express.Multer.File) {
    const profile = await this.prisma.tenantProfile.findFirst({
      where: { id: tenantProfileId, userId, deletedAt: null },
    });
    if (!profile) throw new NotFoundException('Tenant profile not found');

    const stored = await this.storage.saveFile(file, 'avatars');

    // Keep the tenant-facing avatar in sync on the user account too, so chat
    // sender bubbles and the sidebar show the same picture everywhere.
    const updated = await this.prisma.$transaction([
      this.prisma.tenantProfile.update({
        where: { id: tenantProfileId },
        data: { profileImageUrl: stored.url },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: { avatarUrl: stored.url },
      }),
    ]);

    if (profile.profileImageUrl && profile.profileImageUrl !== stored.url) {
      await this.storage.deleteByUrl(profile.profileImageUrl);
    }
    return updated[0];
  }

  // Guarantees the tenant profile both exists AND belongs to the
  // caller's organization.
  private async getOwnedTenantProfile(
    organizationId: string,
    tenantProfileId: string,
    include?: Prisma.TenantProfileInclude,
  ) {
    const profile = await this.prisma.tenantProfile.findFirst({
      where: { id: tenantProfileId, organizationId, deletedAt: null },
      include,
    });
    if (!profile) throw new NotFoundException('Tenant not found');
    return profile;
  }
}
