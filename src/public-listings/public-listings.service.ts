import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UnitAvailabilityStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';
import { PublicListingsQueryDto } from './dto/public-listings-query.dto';

/**
 * Public, unauthenticated marketplace (spec §29–30). Only surfaces units
 * that are listing-enabled at BOTH property and unit level and currently
 * rentable (never OCCUPIED — deriving availability from tenancy state,
 * spec §30). Never exposes private tenant/landlord data: responses are
 * shaped here, not by dumping the raw Prisma records.
 */
@Injectable()
export class PublicListingsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly listableAvailability = [
    UnitAvailabilityStatus.VACANT,
    UnitAvailabilityStatus.AVAILABLE,
    UnitAvailabilityStatus.RESERVED,
  ];

  async search(query: PublicListingsQueryDto) {
    const propertyWhere: Prisma.PropertyWhereInput = {
      isPubliclyListable: true,
      status: 'ACTIVE',
      deletedAt: null,
    };
    if (query.county) propertyWhere.county = query.county;
    if (query.city) propertyWhere.city = query.city;
    if (query.neighborhood) propertyWhere.neighborhood = query.neighborhood;
    if (query.propertyType) propertyWhere.propertyType = query.propertyType as never;

    const where: Prisma.UnitWhereInput = {
      deletedAt: null,
      isPubliclyListable: true,
      availabilityStatus: { in: this.listableAvailability },
      property: propertyWhere,
    };

    if (query.search) {
      where.OR = [
        { unitNumber: { contains: query.search, mode: 'insensitive' } },
        { property: { name: { contains: query.search, mode: 'insensitive' } } },
        { property: { city: { contains: query.search, mode: 'insensitive' } } },
        { property: { neighborhood: { contains: query.search, mode: 'insensitive' } } },
      ];
    }
    if (query.unitType) where.unitType = query.unitType as never;
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.baseRent = {
        ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
        ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
      };
    }
    if (query.bedrooms !== undefined) where.bedrooms = query.bedrooms;
    if (query.bathrooms !== undefined) where.bathrooms = query.bathrooms;
    if (query.amenities?.length) {
      where.amenities = { hasEvery: query.amenities };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.unit.findMany({
        where,
        skip: paginationSkip(page, limit),
        take: limit,
        orderBy: { baseRent: query.sortOrder ?? 'asc' },
        select: {
          id: true,
          unitNumber: true,
          unitType: true,
          floor: true,
          bedrooms: true,
          bathrooms: true,
          sizeSqm: true,
          baseRent: true,
          depositAmount: true,
          amenities: true,
          description: true,
          images: { select: { id: true, url: true, caption: true }, take: 5 },
          property: {
            select: {
              id: true,
              name: true,
              propertyType: true,
              county: true,
              city: true,
              neighborhood: true,
              description: true,
              images: { select: { id: true, url: true }, take: 5 },
              verificationStatus: true,
            },
          },
        },
      }),
      this.prisma.unit.count({ where }),
    ]);

    return buildPaginatedResult(data, total, page, limit);
  }

  async getListing(unitId: string) {
    const unit = await this.prisma.unit.findFirst({
      where: {
        id: unitId,
        deletedAt: null,
        isPubliclyListable: true,
        availabilityStatus: { in: this.listableAvailability },
        property: { isPubliclyListable: true, status: 'ACTIVE', deletedAt: null },
      },
      select: {
        id: true,
        unitNumber: true,
        unitType: true,
        floor: true,
        bedrooms: true,
        bathrooms: true,
        sizeSqm: true,
        baseRent: true,
        depositAmount: true,
        amenities: true,
        description: true,
        images: { select: { id: true, url: true, caption: true } },
        building: { select: { id: true, name: true } },
        property: {
          select: {
            id: true,
            name: true,
            propertyType: true,
            description: true,
            addressLine: true,
            county: true,
            city: true,
            neighborhood: true,
            amenities: true,
            contactPhone: true,
            contactEmail: true,
            images: { select: { id: true, url: true } },
            verificationStatus: true,
          },
        },
      },
    });
    if (!unit) throw new NotFoundException('Listing not found or not currently available');

    // Contact details are limited to what a prospective tenant needs to
    // reach the landlord via the inquiry flow (spec §31 prefers it that
    // way); further disclosure happens via inquiry responses.
    return unit;
  }

  /**
   * Marketplace summary counts for portal "quick stats" without the full
   * listing payload (e.g. "1,240 units available in Nairobi").
   */
  async getMarketSummary() {
    const listableAvailability = { in: this.listableAvailability } as const;
    const base: Prisma.UnitWhereInput = {
      deletedAt: null,
      isPubliclyListable: true,
      availabilityStatus: listableAvailability,
      property: { isPubliclyListable: true, status: 'ACTIVE', deletedAt: null },
    };

    const total = await this.prisma.unit.count({ where: base });
    const counties = await this.prisma.unit.groupBy({
      by: ['propertyId'],
      where: base,
      _count: true,
    });

    return {
      availableUnits: total,
      counties: counties.length,
    };
  }
}
