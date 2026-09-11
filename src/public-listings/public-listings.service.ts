import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { UnitTypesService } from '../unit-types/unit-types.service';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';
import { PublicListingsQueryDto } from './dto/public-listings-query.dto';

const CACHE_TTL_MS = 30_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Public, unauthenticated marketplace (spec §29–30), now an
 * e-commerce-style stock model: ONE card per unit type per property with
 * live vacancy counts, not one card per physical unit. Only surfaces types
 * that are listing-enabled at BOTH property and type level. AUTO-tracked
 * types derive vacancy from tenancy state; MANUAL types use the declared
 * stepper count. Expired soft-holds are released lazily before reads so a
 * reserved slot never keeps showing as unavailable after its 30 minutes.
 *
 * Responses are shaped here, never raw Prisma records: private
 * tenant/landlord data is excluded (spec §31).
 */
@Injectable()
export class PublicListingsService {
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly unitTypes: UnitTypesService,
  ) {}

  private cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > Date.now()) {
      return Promise.resolve(hit.value as T);
    }
    return compute().then((value) => {
      this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    });
  }

  async search(query: PublicListingsQueryDto) {
    // Give back any expired 30-minute holds so they don't suppress
    // availability after the reservation window (the reconciler sweeps
    // independently every 5 minutes).
    await this.unitTypes.releaseExpiredHolds();

    return this.cached(`search:${JSON.stringify(query)}`, async () => {
      const propertyWhere: Prisma.PropertyWhereInput = {
        isPubliclyListable: true,
        status: 'ACTIVE',
        deletedAt: null,
      };
      if (query.county) propertyWhere.county = query.county;
      if (query.city) propertyWhere.city = query.city;
      if (query.neighborhood) propertyWhere.neighborhood = query.neighborhood;
      if (query.propertyType) propertyWhere.propertyType = query.propertyType as never;

      const where: Prisma.UnitTypeDefinitionWhereInput = {
        deletedAt: null,
        isPubliclyListable: true,
        // Stock model: a type with 0 vacant units is fully booked and
        // hidden by default; the marketplace can opt in to show them
        // greyed out ("includeUnavailable").
        ...(query.includeUnavailable ? {} : { vacantCount: { gt: 0 } }),
        ...(query.unitType
          ? { typeName: { contains: query.unitType, mode: 'insensitive' } }
          : {}),
        property: propertyWhere,
      };

      if (query.search) {
        const term = query.search;
        where.OR = [
          { typeName: { contains: term, mode: 'insensitive' } },
          { property: { name: { contains: term, mode: 'insensitive' } } },
          { property: { city: { contains: term, mode: 'insensitive' } } },
          { property: { neighborhood: { contains: term, mode: 'insensitive' } } },
        ];
      }
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
        this.prisma.unitTypeDefinition.findMany({
          where,
          skip: paginationSkip(page, limit),
          take: limit,
          orderBy: { baseRent: query.sortOrder ?? 'asc' },
          select: {
            id: true,
            typeName: true,
            baseRent: true,
            depositAmount: true,
            description: true,
            amenities: true,
            bedrooms: true,
            bathrooms: true,
            sizeSqm: true,
            trackingMode: true,
            totalCount: true,
            vacantCount: true,
            representativeImage: true,
            building: { select: { id: true, name: true } },
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
        this.prisma.unitTypeDefinition.count({ where }),
      ]);

      return buildPaginatedResult(data, total, page, limit);
    });
  }

  async getListing(unitTypeId: string) {
    await this.unitTypes.releaseExpiredHolds();

    const listing = await this.prisma.unitTypeDefinition.findFirst({
      where: {
        id: unitTypeId,
        deletedAt: null,
        isPubliclyListable: true,
        property: { isPubliclyListable: true, status: 'ACTIVE', deletedAt: null },
      },
      select: {
        id: true,
        typeName: true,
        baseRent: true,
        depositAmount: true,
        description: true,
        amenities: true,
        bedrooms: true,
        bathrooms: true,
        sizeSqm: true,
        trackingMode: true,
        totalCount: true,
        vacantCount: true,
        representativeImage: true,
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
    if (!listing) {
      throw new NotFoundException('Listing not found or not currently available');
    }

    // Contact details are limited to what a prospective tenant needs to
    // reach the landlord via the inquiry flow (spec §31); anything further
    // is disclosed through inquiry responses.
    return listing;
  }

  /**
   * Marketplace summary counts for portal "quick stats" without the full
   * listing payload (e.g. "1,240 units available in Nairobi"). Counts
   * unit types with at least one vacant unit rather than physical units.
   */
  async getMarketSummary() {
    return this.cached('summary', async () => {
      const base: Prisma.UnitTypeDefinitionWhereInput = {
        deletedAt: null,
        isPubliclyListable: true,
        vacantCount: { gt: 0 },
        property: { isPubliclyListable: true, status: 'ACTIVE', deletedAt: null },
      };

      const total = await this.prisma.unitTypeDefinition.count({ where: base });
      const counties = await this.prisma.unitTypeDefinition.groupBy({
        by: ['propertyId'],
        where: base,
        _count: true,
      });
      return {
        availableUnits: total,
        counties: counties.length,
      };
    });
  }
}