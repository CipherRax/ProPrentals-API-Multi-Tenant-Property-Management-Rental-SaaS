import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { AuditService } from '../common/utils/audit.service';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Every org-scoped read/write in this and later modules must go through
  // membership verification like this — never trust an orgId path param
  // without confirming the authenticated user actually belongs to it.
  async assertMembership(userId: string, organizationId: string) {
    const membership = await this.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membership || !membership.isActive) {
      throw new ForbiddenException('You do not have access to this organization');
    }
    return membership;
  }

  async listMyOrganizations(userId: string) {
    const memberships = await this.prisma.organizationMember.findMany({
      where: { userId, isActive: true },
      include: { organization: true },
      orderBy: { joinedAt: 'asc' },
    });
    return memberships.map((m) => ({ ...m.organization, myRole: m.role }));
  }

  async getOrganization(userId: string, organizationId: string) {
    await this.assertMembership(userId, organizationId);
    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org || org.deletedAt) throw new NotFoundException('Organization not found');
    return org;
  }

  async updateOrganization(
    userId: string,
    organizationId: string,
    dto: UpdateOrganizationDto,
  ) {
    const membership = await this.assertMembership(userId, organizationId);
    if (membership.role !== 'OWNER' && membership.role !== 'PROPERTY_MANAGER') {
      throw new ForbiddenException('Only owners or property managers can update the organization');
    }

    const before = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: dto,
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'ORGANIZATION_UPDATED',
      entityType: 'Organization',
      entityId: organizationId,
      previousValue: before,
      newValue: updated,
    });

    return updated;
  }
}
