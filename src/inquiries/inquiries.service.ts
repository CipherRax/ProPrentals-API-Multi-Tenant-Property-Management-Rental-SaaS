import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InquiryStatus, OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UnitTypesService } from '../unit-types/unit-types.service';
import { AuditService } from '../common/utils/audit.service';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';
import { CreateInquiryDto } from '../public-listings/dto/create-inquiry.dto';
import { UpdateInquiryStatusDto } from '../public-listings/dto/update-inquiry-status.dto';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER', 'STAFF'];

/**
 * Property inquiries (spec §31): public visitors reach landlords through
 * the platform without a phone number being exposed up front. Creation is
 * public and resolves the target organization only from the
 * unit-type/unit/property the visitor picked — never from client-supplied
 * org IDs. Management is org-scoped with full status lifecycle.
 *
 * Stock-model integration: inquiries can target a whole UNIT TYPE (the
 * marketplace's stock item). The type's vacancy is snapshotted at inquiry
 * time (vacantAtInquiry) so the landlord sees how many matching units were
 * free. Marking an inquiry CONVERTED soft-holds one vacancy for 30
 * minutes so the composed slot can't be double-booked while the landlord
 * follows up.
 */
@Injectable()
export class InquiriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly notifications: NotificationsService,
    private readonly unitTypes: UnitTypesService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateInquiryDto) {
    // Resolve the target organization from a real, publicly listed entity.
    // Prefer the unit type (the modern marketplace flow), then the physical
    // unit, then the property — but never from client-supplied org IDs.
    let organizationId: string | null = null;
    let propertyId: string | null = dto.propertyId ?? null;
    const unitId: string | null = dto.unitId ?? null;
    let unitTypeId: string | null = dto.unitTypeId ?? null;
    let vacantAtInquiry: number | null = null;

    if (unitTypeId) {
      const unitType = await this.prisma.unitTypeDefinition.findFirst({
        where: {
          id: unitTypeId,
          deletedAt: null,
          isPubliclyListable: true,
          property: { isPubliclyListable: true, status: 'ACTIVE', deletedAt: null },
        },
        include: { property: { select: { id: true, organizationId: true } } },
      });
      if (!unitType) throw new BadRequestException('That unit type is not currently listed publicly');
      organizationId = unitType.property.organizationId;
      propertyId = unitType.property.id;
      vacantAtInquiry = unitType.vacantCount;
    } else if (unitId) {
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
      if (unit.unitTypeId) {
        const t = await this.prisma.unitTypeDefinition.findUnique({
          where: { id: unit.unitTypeId },
          select: { vacantCount: true },
        });
        vacantAtInquiry = t?.vacantCount ?? null;
      }
    } else if (propertyId) {
      const property = await this.prisma.property.findFirst({
        where: { id: propertyId, deletedAt: null, isPubliclyListable: true, status: 'ACTIVE' },
      });
      if (!property)
        throw new BadRequestException('That property is not currently listed publicly');
      organizationId = property.organizationId;
    } else {
      throw new BadRequestException('Provide a unitTypeId, unitId or propertyId');
    }

    const inquiry = await this.prisma.propertyInquiry.create({
      data: {
        organizationId,
        propertyId,
        unitId,
        unitTypeId,
        vacantAtInquiry,
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
        recipientUserId: owner.user.id,
        organizationId,
        type: 'INVITATION_RECEIVED',
        title: 'New property inquiry',
        body: `${dto.name} (${dto.email}) is interested: ${dto.message}`.slice(0, 500),
        data: { inquiryId: inquiry.id, unitTypeId: unitTypeId ?? undefined },
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
          unitType: { select: { id: true, typeName: true, vacantCount: true } },
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
        unitType: { select: { id: true, typeName: true, vacantCount: true } },
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

    const transitioning = dto.status !== existing.status;
    const now = new Date();
    const hasActiveHold =
      existing.unitTypeId !== null &&
      existing.reservedAt !== null &&
      existing.reservationExpiresAt !== null &&
      existing.holdReleasedAt === null;

    let holdBox: { holdEffect: { before?: number; after?: number } | null } = {
      holdEffect: null,
    };

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.status === 'CONVERTED' && existing.unitTypeId && transitioning) {
        // An active hold already counts this slot — re-marking CONVERTED is
        // a no-op for vacancy. Otherwise (fresh or expired) acquire a hold.
        if (!hasActiveHold || (existing.reservationExpiresAt! < now && existing.holdReleasedAt === null)) {
          // Let any stale expired hold on this inquiry go first.
          if (existing.reservedAt !== null && existing.holdReleasedAt === null) {
            await this.unitTypes.releaseHoldTx(tx, existing);
          }
          holdBox.holdEffect = await this.unitTypes.acquireHoldTx(tx, existing.id, existing.unitTypeId);
        }
      } else if (
        dto.status !== 'CONVERTED' &&
        existing.unitTypeId &&
        existing.reservedAt !== null &&
        existing.holdReleasedAt === null &&
        transitioning
      ) {
        // Moving off "confirming" frees the held slot.
        holdBox.holdEffect = await this.unitTypes.releaseHoldTx(tx, existing);
      }

      const result = await tx.propertyInquiry.update({
        where: { id: inquiryId },
        data: { status: dto.status, respondedAt: new Date() },
      });

      return result;
    });

    const { holdEffect } = holdBox;
    if (holdEffect?.after !== undefined && holdEffect.before !== undefined) {
      await this.unitTypes.maybeAlertLowVacancy(
        existing.unitTypeId!,
        holdEffect.before,
        holdEffect.after,
      );
      await this.audit.log({
        organizationId,
        actorUserId: userId,
        action:
          dto.status === 'CONVERTED'
            ? 'VACANCY_HOLD_ACQUIRED'
            : 'VACANCY_HOLD_RELEASED',
        entityType: 'PropertyInquiry',
        entityId: inquiryId,
        newValue: holdEffect,
      });
    }

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

  /** Explicitly release a soft-hold without changing the inquiry status. */
  async releaseHold(userId: string, organizationId: string, inquiryId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new BadRequestException('You cannot manage inquiries for this organization');
    }
    const existing = await this.prisma.propertyInquiry.findFirst({
      where: { id: inquiryId, organizationId },
    });
    if (!existing) throw new NotFoundException('Inquiry not found');
    if (existing.reservedAt === null || existing.holdReleasedAt !== null) {
      return { released: false, reason: 'No active hold on this inquiry' };
    }

    const holdEffect = await this.prisma.$transaction((tx) =>
      this.unitTypes.releaseHoldTx(tx, existing),
    );

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'VACANCY_HOLD_RELEASED',
      entityType: 'PropertyInquiry',
      entityId: inquiryId,
      newValue: holdEffect,
    });

    return { released: true, holdEffect };
  }
}