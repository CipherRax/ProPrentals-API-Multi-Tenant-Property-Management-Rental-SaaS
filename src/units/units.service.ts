import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../common/utils/audit.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { QueryUnitsDto } from './dto/query-units.dto';
import { AddUnitImageDto } from './dto/add-unit-image.dto';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER'];

@Injectable()
export class UnitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
  ) {}

  private assertCanManage(role: OrgRole) {
    if (!MANAGE_ROLES.includes(role)) {
      throw new ForbiddenException('Only owners or property managers can manage units');
    }
  }

  private async getOwnedProperty(organizationId: string, propertyId: string) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId, deletedAt: null },
    });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  private async getOwnedUnit(organizationId: string, propertyId: string, unitId: string) {
    await this.getOwnedProperty(organizationId, propertyId);
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, propertyId, deletedAt: null },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    return unit;
  }

  async create(userId: string, organizationId: string, propertyId: string, dto: CreateUnitDto) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    await this.getOwnedProperty(organizationId, propertyId);

    if (dto.buildingId) {
      const building = await this.prisma.building.findFirst({
        where: { id: dto.buildingId, propertyId, deletedAt: null },
      });
      if (!building) {
        throw new BadRequestException('buildingId does not belong to this property');
      }
    }

    try {
      const unit = await this.prisma.unit.create({
        data: {
          propertyId,
          buildingId: dto.buildingId,
          unitNumber: dto.unitNumber,
          unitType: dto.unitType,
          floor: dto.floor,
          bedrooms: dto.bedrooms,
          bathrooms: dto.bathrooms,
          sizeSqm: dto.sizeSqm,
          baseRent: dto.baseRent,
          depositAmount: dto.depositAmount,
          description: dto.description,
          amenities: dto.amenities ?? [],
        },
      });

      await this.audit.log({
        organizationId,
        actorUserId: userId,
        action: 'UNIT_CREATED',
        entityType: 'Unit',
        entityId: unit.id,
        newValue: unit,
      });

      return unit;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A unit with this unit number already exists on this property');
      }
      throw err;
    }
  }

  async findAll(
    userId: string,
    organizationId: string,
    propertyId: string,
    query: QueryUnitsDto,
  ) {
    await this.organizations.assertMembership(userId, organizationId);
    await this.getOwnedProperty(organizationId, propertyId);

    const where: Prisma.UnitWhereInput = {
      propertyId,
      deletedAt: null,
      ...(query.buildingId ? { buildingId: query.buildingId } : {}),
      ...(query.unitType ? { unitType: query.unitType } : {}),
      ...(query.availabilityStatus ? { availabilityStatus: query.availabilityStatus } : {}),
      ...(query.search ? { unitNumber: { contains: query.search, mode: 'insensitive' } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.unit.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { createdAt: query.sortOrder },
      }),
      this.prisma.unit.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async findOne(userId: string, organizationId: string, propertyId: string, unitId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    const unit = await this.prisma.unit.findFirst({
      where: { id: unitId, propertyId, deletedAt: null },
      include: { images: { orderBy: { sortOrder: 'asc' } }, building: true },
    });
    if (!unit) throw new NotFoundException('Unit not found');
    return unit;
  }

  async update(
    userId: string,
    organizationId: string,
    propertyId: string,
    unitId: string,
    dto: UpdateUnitDto,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    const before = await this.getOwnedUnit(organizationId, propertyId, unitId);

    if (dto.buildingId) {
      const building = await this.prisma.building.findFirst({
        where: { id: dto.buildingId, propertyId, deletedAt: null },
      });
      if (!building) {
        throw new BadRequestException('buildingId does not belong to this property');
      }
    }

    // OCCUPIED is derived from Tenancy state from Phase 3 onward — block
    // manual overrides into/out of OCCUPIED once tenancies exist so the
    // two sources of truth can't drift apart (spec §9).
    if (dto.availabilityStatus === 'OCCUPIED' || before.availabilityStatus === 'OCCUPIED') {
      throw new BadRequestException(
        'OCCUPIED status is derived from active tenancy records and cannot be set manually. Use the tenancy endpoints (Phase 3) instead.',
      );
    }

    try {
      const updated = await this.prisma.unit.update({
        where: { id: unitId },
        data: dto,
      });

      await this.audit.log({
        organizationId,
        actorUserId: userId,
        action: 'UNIT_UPDATED',
        entityType: 'Unit',
        entityId: unitId,
        previousValue: before,
        newValue: updated,
      });

      return updated;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A unit with this unit number already exists on this property');
      }
      throw err;
    }
  }

  async remove(userId: string, organizationId: string, propertyId: string, unitId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    const unit = await this.getOwnedUnit(organizationId, propertyId, unitId);

    if (unit.availabilityStatus === 'OCCUPIED') {
      throw new ForbiddenException('Cannot remove a unit with an active tenancy');
    }

    const archived = await this.prisma.unit.update({
      where: { id: unitId },
      data: { deletedAt: new Date(), availabilityStatus: 'UNAVAILABLE', isPubliclyListable: false },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'UNIT_ARCHIVED',
      entityType: 'Unit',
      entityId: unitId,
    });

    return archived;
  }

  async addImage(
    userId: string,
    organizationId: string,
    propertyId: string,
    unitId: string,
    dto: AddUnitImageDto,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    await this.getOwnedUnit(organizationId, propertyId, unitId);

    return this.prisma.unitImage.create({
      data: { unitId, url: dto.url, caption: dto.caption },
    });
  }

  async removeImage(
    userId: string,
    organizationId: string,
    propertyId: string,
    unitId: string,
    imageId: string,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    await this.getOwnedUnit(organizationId, propertyId, unitId);

    const image = await this.prisma.unitImage.findUnique({ where: { id: imageId } });
    if (!image || image.unitId !== unitId) {
      throw new NotFoundException('Image not found on this unit');
    }
    await this.prisma.unitImage.delete({ where: { id: imageId } });
    return { message: 'Image removed' };
  }
}
