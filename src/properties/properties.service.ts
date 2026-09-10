import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AuditService } from '../common/utils/audit.service';
import { StorageService } from '../storage/storage.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { QueryPropertiesDto } from './dto/query-properties.dto';
import { AddPropertyImageDto } from './dto/add-property-image.dto';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER'];

@Injectable()
export class PropertiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly subscriptions: SubscriptionsService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private assertCanManage(role: OrgRole) {
    if (!MANAGE_ROLES.includes(role)) {
      throw new ForbiddenException('Only owners or property managers can manage properties');
    }
  }

  async create(userId: string, organizationId: string, dto: CreatePropertyDto) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    await this.subscriptions.assertCanCreate(organizationId, 'property');

    const property = await this.prisma.property.create({
      data: { ...dto, organizationId },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'PROPERTY_CREATED',
      entityType: 'Property',
      entityId: property.id,
      newValue: property,
    });

    return property;
  }

  async findAll(userId: string, organizationId: string, query: QueryPropertiesDto) {
    await this.organizations.assertMembership(userId, organizationId);

    const where: Prisma.PropertyWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.propertyType ? { propertyType: query.propertyType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { city: { contains: query.search, mode: 'insensitive' } },
              { county: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { createdAt: query.sortOrder },
        include: { _count: { select: { units: true, buildings: true } } },
      }),
      this.prisma.property.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async findOne(userId: string, organizationId: string, propertyId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    const property = await this.getOwnedProperty(organizationId, propertyId, {
      buildings: true,
      images: { orderBy: { sortOrder: 'asc' } },
      _count: { select: { units: true } },
    });
    return property;
  }

  async update(userId: string, organizationId: string, propertyId: string, dto: UpdatePropertyDto) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);

    const before = await this.getOwnedProperty(organizationId, propertyId);
    const updated = await this.prisma.property.update({
      where: { id: propertyId },
      data: dto,
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'PROPERTY_UPDATED',
      entityType: 'Property',
      entityId: propertyId,
      previousValue: before,
      newValue: updated,
    });

    return updated;
  }

  async remove(userId: string, organizationId: string, propertyId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);

    await this.getOwnedProperty(organizationId, propertyId);

    // Soft delete only — spec §54: properties must preserve history.
    const archived = await this.prisma.property.update({
      where: { id: propertyId },
      data: { deletedAt: new Date(), status: 'ARCHIVED' },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'PROPERTY_ARCHIVED',
      entityType: 'Property',
      entityId: propertyId,
    });

    return archived;
  }

  async addImage(
    userId: string,
    organizationId: string,
    propertyId: string,
    dto: AddPropertyImageDto,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    await this.getOwnedProperty(organizationId, propertyId);

    return this.prisma.propertyImage.create({
      data: { propertyId, url: dto.url, caption: dto.caption },
    });
  }

  async uploadImages(
    userId: string,
    organizationId: string,
    propertyId: string,
    files: Express.Multer.File[],
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    await this.getOwnedProperty(organizationId, propertyId);

    if (!files?.length) throw new NotFoundException('No images provided');

    const last = await this.prisma.propertyImage.findFirst({
      where: { propertyId },
      orderBy: { sortOrder: 'desc' },
    });
    let sortOrder = last ? last.sortOrder + 1 : 0;

    const images = [];
    for (const file of files) {
      const { url } = await this.storage.saveFile(file, 'properties');
      images.push(
        await this.prisma.propertyImage.create({
          data: { propertyId, url, sortOrder: sortOrder++ },
        }),
      );
    }
    return images;
  }

  async removeImage(userId: string, organizationId: string, propertyId: string, imageId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    await this.getOwnedProperty(organizationId, propertyId);

    const image = await this.prisma.propertyImage.findUnique({ where: { id: imageId } });
    if (!image || image.propertyId !== propertyId) {
      throw new NotFoundException('Image not found on this property');
    }
    await this.prisma.propertyImage.delete({ where: { id: imageId } });
    await this.storage.deleteByUrl(image.url);
    return { message: 'Image removed' };
  }

  // Guarantees the property both exists AND belongs to the caller's
  // organization — the second half is the actual isolation guarantee.
  private async getOwnedProperty(
    organizationId: string,
    propertyId: string,
    include?: Prisma.PropertyInclude,
  ) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId, deletedAt: null },
      include,
    });
    if (!property) {
      throw new NotFoundException('Property not found');
    }
    return property;
  }
}
