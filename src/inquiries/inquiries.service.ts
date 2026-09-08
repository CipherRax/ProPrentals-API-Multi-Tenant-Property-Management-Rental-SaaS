import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InquiryStatus, OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../common/utils/audit.service';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';
import { CreateInquiryDto } from '../public-listings/dto/create-inquiry.dto';
import { UpdateInquiryStatusDto } from '../public-listings/dto/update-inquiry-status.dto';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER', 'STAFF'];

/**
 * Property inquiries (spec §31): public visitors reach landlords through
 * the platform without a phone number being exposed up front. Creation is
 * public and resolves the target organization only from the unit/property
 * the visitor picked — never from client-supplied org IDs. Management is
 * org-scoped with full status lifecycle.
 */
@Injectable()
export class InquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateInquiryDto) {
    // Resolve the target organization from a real unit/property. At least
    // one must be provided and must point to a publicly listed entity, so
    // inquiries can't be spammed into private orgs.
    let organizationId: string | null = null;
    let propertyId: string | null = dto.propertyId ?? null;
    const unitId: string | null = dto.unitId ?? null;

    if (unitId) {
      const unit = await this.prisma.unit.findFirst({
        where: {
          id: unitId,
          deletedAt: null,
          isPubliclyListable: true,
          property: { isPubliclyListable: true, status: 'ACTIVE' },
        },
        include: { property: { select: { id: true, organizationId: true } } },
      });
      if (!unit) throw new BadRequestException('That unit is not currently listed publicly');
      organizationId = unit.property.organizationId;
      propertyId = unit.property.id;
    } else if (propertyId) {
      const property = await this.prisma.property.findFirst({
        where: { id: propertyId, deletedAt: null, isPubliclyListable: true, status: 'ACTIVE' },
      });
      if (!property)
        throw new BadRequestException('That property is not currently listed publicly');
      organizationId = property.organizationId;
    } else {
      throw new BadRequestException('Provide a unitId or propertyId');
    }

    const inquiry = await this.prisma.propertyInquiry.create({
      data: {
        organizationId,
        propertyId,
        unitId,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        message: dto.message,
      },
    });

    // Notify the org owner so someone actually follows up.
    const owner = await this.prisma.organizationMember.findFirst({
      where: { organizationId, role: 'OWNER', isActive: true },
      include: { user: { select: { id: true, email: true, phone: true } } },
    });
    if (owner) {
      await this.notifications.dispatch({
        recipientUserId: owner.userId,
        organizationId,
        type: 'INVITATION_RECEIVED',
        title: 'New property inquiry',
        body: `${dto.name} (${dto.email}) is interested: ${dto.message}`.slice(0, 500),
        data: { inquiryId: inquiry.id },
        email: owner.user.email,
        phone: owner.user.phone ?? undefined,
      });
    }

    // The visitor never learns which tenant org owns the listing (spec §31).
    const { organizationId: _orgId, ...publicInquiry } = inquiry;
    return publicInquiry;
  }

  async list(userId: string, organizationId: string, page = 1, limit = 20, status?: InquiryStatus) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new BadRequestException('You cannot manage inquiries for this organization');
    }
    const where: Prisma.PropertyInquiryWhereInput = {
      organizationId,
      ...(status ? { status } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.propertyInquiry.findMany({
        where,
        skip: paginationSkip(page, limit),
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          property: { select: { id: true, name: true } },
          unit: { select: { id: true, unitNumber: true } },
        },
      }),
      this.prisma.propertyInquiry.count({ where }),
    ]);
    return buildPaginatedResult(data, total, page, limit);
  }

  async getOne(userId: string, organizationId: string, inquiryId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    const inquiry = await this.prisma.propertyInquiry.findFirst({
      where: { id: inquiryId, organizationId },
      include: {
        property: { select: { id: true, name: true } },
        unit: { select: { id: true, unitNumber: true } },
      },
    });
    if (!inquiry) throw new NotFoundException('Inquiry not found');
    return inquiry;
  }

  async updateStatus(
    userId: string,
    organizationId: string,
    inquiryId: string,
    dto: UpdateInquiryStatusDto,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new BadRequestException('You cannot manage inquiries for this organization');
    }
    const existing = await this.prisma.propertyInquiry.findFirst({
      where: { id: inquiryId, organizationId },
    });
    if (!existing) throw new NotFoundException('Inquiry not found');

    const updated = await this.prisma.propertyInquiry.update({
      where: { id: inquiryId },
      data: { status: dto.status, respondedAt: new Date() },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'INQUIRY_STATUS_UPDATED',
      entityType: 'PropertyInquiry',
      entityId: inquiryId,
      previousValue: existing,
      newValue: updated,
    });

    return updated;
  }
}
