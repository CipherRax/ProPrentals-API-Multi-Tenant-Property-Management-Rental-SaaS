import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../common/utils/audit.service';
import { CreateBuildingDto } from './dto/create-building.dto';
import { UpdateBuildingDto } from './dto/update-building.dto';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER'];

@Injectable()
export class BuildingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
  ) {}

  private assertCanManage(role: OrgRole) {
    if (!MANAGE_ROLES.includes(role)) {
      throw new ForbiddenException('Only owners or property managers can manage buildings');
    }
  }

  // Confirms the property exists, is not soft-deleted, and belongs to
  // the caller's organization — the actual isolation guarantee.
  private async getOwnedProperty(organizationId: string, propertyId: string) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId, deletedAt: null },
    });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  private async getOwnedBuilding(organizationId: string, propertyId: string, buildingId: string) {
    await this.getOwnedProperty(organizationId, propertyId);
    const building = await this.prisma.building.findFirst({
      where: { id: buildingId, propertyId, deletedAt: null },
    });
    if (!building) throw new NotFoundException('Building not found');
    return building;
  }

  async create(
    userId: string,
    organizationId: string,
    propertyId: string,
    dto: CreateBuildingDto,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    await this.getOwnedProperty(organizationId, propertyId);

    const building = await this.prisma.building.create({
      data: { ...dto, propertyId },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'BUILDING_CREATED',
      entityType: 'Building',
      entityId: building.id,
      newValue: building,
    });

    return building;
  }

  async findAll(userId: string, organizationId: string, propertyId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    await this.getOwnedProperty(organizationId, propertyId);

    return this.prisma.building.findMany({
      where: { propertyId, deletedAt: null },
      include: { _count: { select: { units: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(userId: string, organizationId: string, propertyId: string, buildingId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    return this.getOwnedBuilding(organizationId, propertyId, buildingId);
  }

  async update(
    userId: string,
    organizationId: string,
    propertyId: string,
    buildingId: string,
    dto: UpdateBuildingDto,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    const before = await this.getOwnedBuilding(organizationId, propertyId, buildingId);

    const updated = await this.prisma.building.update({
      where: { id: buildingId },
      data: dto,
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'BUILDING_UPDATED',
      entityType: 'Building',
      entityId: buildingId,
      previousValue: before,
      newValue: updated,
    });

    return updated;
  }

  async remove(userId: string, organizationId: string, propertyId: string, buildingId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    await this.getOwnedBuilding(organizationId, propertyId, buildingId);

    const unitCount = await this.prisma.unit.count({
      where: { buildingId, deletedAt: null },
    });
    if (unitCount > 0) {
      throw new ForbiddenException(
        'Cannot remove a building that still has units assigned to it. Reassign or remove the units first.',
      );
    }

    const archived = await this.prisma.building.update({
      where: { id: buildingId },
      data: { deletedAt: new Date() },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'BUILDING_ARCHIVED',
      entityType: 'Building',
      entityId: buildingId,
    });

    return archived;
  }
}
