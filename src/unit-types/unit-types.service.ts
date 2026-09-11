import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../common/utils/audit.service';
import { StorageService } from '../storage/storage.service';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';
import { CreateUnitTypeDto } from './dto/create-unit-type.dto';
import { UpdateUnitTypeDto } from './dto/update-unit-type.dto';
import { QueryUnitTypesDto } from './dto/query-unit-types.dto';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER'];
export const VACANCY_HOLD_MS = 30 * 60 * 1000; // 30-minute soft hold
const DEFAULT_LOW_VACANCY_THRESHOLD = 3;

type Tx = Prisma.TransactionClient;
export interface CountSnapshot {
  unitTypeId: string;
  before: number;
  after: number;
}

/**
 * Unit types are the marketplace's stock items (one public card per type
 * per property in the e-commerce model). Vacancy is tracked two ways:
 *
 *  - AUTO (default): totalCount/vacantCount are DERIVED from physical
 *    Unit records + tenancy state. Every unit/tenancy mutation resyncs,
 *    and a periodic reconciler normalises drift. Recommended wherever
 *    lease records exist (single source of truth).
 *  - MANUAL: the landlord has no per-unit records (or doesn't want them)
 *    and declares stock via the +/- stepper or bulk import.
 *
 * Soft holds: when a landlord marks an inquiry CONVERTED, one vacancy is
 * held for 30 minutes so the composed slot can't be double-booked. Holds
 * sit on top of either tracking mode and are given back lazily (on read)
 * and by the reconciler.
 */
@Injectable()
export class UnitTypesService {
  private readonly logger = new Logger(UnitTypesService.name);
  private readonly lowVacancyThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
  ) {
    const configured = this.config.get<number>('lowVacancyThreshold');
    this.lowVacancyThreshold =
      typeof configured === 'number' && Number.isFinite(configured) && configured > 0
        ? configured
        : DEFAULT_LOW_VACANCY_THRESHOLD;
  }

  private assertCanManage(role: OrgRole) {
    if (!MANAGE_ROLES.includes(role)) {
      throw new ForbiddenException('Only owners or property managers can manage unit types');
    }
  }

  private async getOwnedProperty(organizationId: string, propertyId: string) {
    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, organizationId, deletedAt: null },
    });
    if (!property) throw new NotFoundException('Property not found');
    return property;
  }

  private async getOwnedUnitType(organizationId: string, propertyId: string, unitTypeId: string) {
    await this.getOwnedProperty(organizationId, propertyId);
    const unitType = await this.prisma.unitTypeDefinition.findFirst({
      where: { id: unitTypeId, propertyId, deletedAt: null },
    });
    if (!unitType) throw new NotFoundException('Unit type not found');
    return unitType;
  }

  // ── CRUD ───────────────────────────────────────────────────────────

  async create(userId: string, organizationId: string, propertyId: string, dto: CreateUnitTypeDto) {
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

    const duplicate = await this.prisma.unitTypeDefinition.findFirst({
      where: { propertyId, typeName: dto.typeName },
      select: { id: true },
    });
    if (duplicate) {
      throw new ConflictException(
        `A unit type named "${dto.typeName}" already exists on this property. Add units to it or pick another name.`,
      );
    }

    // AUTO unless the landlord is declaring stock up front (a manual count
    // only makes sense when tracking informally, where lease records don't
    // drive the numbers).
    const trackingMode = dto.trackingMode ?? (dto.totalCount && dto.totalCount > 0 ? 'MANUAL' : 'AUTO');
    const declared =
      trackingMode === 'MANUAL'
        ? {
            totalCount: dto.totalCount ?? 0,
            vacantCount: dto.vacantCount ?? 0,
          }
        : { totalCount: 0, vacantCount: 0 };

    if (declared.vacantCount > declared.totalCount) {
      throw new BadRequestException('vacantCount cannot exceed totalCount');
    }

    try {
      const unitType = await this.prisma.unitTypeDefinition.create({
        data: {
          propertyId,
          buildingId: dto.buildingId,
          typeName: dto.typeName,
          baseRent: dto.baseRent,
          depositAmount: dto.depositAmount,
          description: dto.description,
          amenities: dto.amenities ?? [],
          bedrooms: dto.bedrooms,
          bathrooms: dto.bathrooms,
          sizeSqm: dto.sizeSqm,
          trackingMode,
          totalCount: declared.totalCount,
          vacantCount: declared.vacantCount,
          representativeImage: dto.representativeImage,
          isPubliclyListable: dto.isPubliclyListable ?? false,
        },
      });

      await this.audit.log({
        organizationId,
        actorUserId: userId,
        action: 'UNIT_TYPE_CREATED',
        entityType: 'UnitTypeDefinition',
        entityId: unitType.id,
        newValue: unitType,
      });

      return unitType;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(
          `A unit type named "${dto.typeName}" already exists on this property.`,
        );
      }
      throw err;
    }
  }

  async findAll(userId: string, organizationId: string, propertyId: string, query: QueryUnitTypesDto) {
    await this.organizations.assertMembership(userId, organizationId);
    await this.getOwnedProperty(organizationId, propertyId);

    const where: Prisma.UnitTypeDefinitionWhereInput = {
      propertyId,
      deletedAt: null,
      ...(query.search ? { typeName: { contains: query.search, mode: 'insensitive' } } : {}),
      ...(query.buildingId ? { buildingId: query.buildingId } : {}),
      ...(query.trackingMode ? { trackingMode: query.trackingMode } : {}),
      ...(query.fillStatus === 'vacant' ? { vacantCount: { gt: 0 } } : {}),
      ...(query.fillStatus === 'full' ? { vacantCount: 0 } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.unitTypeDefinition.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { baseRent: query.sortOrder ?? 'asc' },
        include: {
          building: { select: { id: true, name: true } },
          _count: { select: { units: true, inquiries: true } },
        },
      }),
      this.prisma.unitTypeDefinition.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async findOne(userId: string, organizationId: string, propertyId: string, unitTypeId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    const unitType = await this.getOwnedUnitType(organizationId, propertyId, unitTypeId);
    return this.prisma.unitTypeDefinition.findUnique({
      where: { id: unitType.id },
      include: {
        building: { select: { id: true, name: true } },
        property: { select: { id: true, name: true } },
        _count: { select: { units: true, inquiries: true } },
      },
    });
  }

  async update(
    userId: string,
    organizationId: string,
    propertyId: string,
    unitTypeId: string,
    dto: UpdateUnitTypeDto,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    const before = await this.getOwnedUnitType(organizationId, propertyId, unitTypeId);

    if (dto.buildingId) {
      const building = await this.prisma.building.findFirst({
        where: { id: dto.buildingId, propertyId, deletedAt: null },
      });
      if (!building) {
        throw new BadRequestException('buildingId does not belong to this property');
      }
    }

    if (dto.typeName && dto.typeName !== before.typeName) {
      const duplicate = await this.prisma.unitTypeDefinition.findFirst({
        where: { propertyId, typeName: dto.typeName },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          `A unit type named "${dto.typeName}" already exists on this property.`,
        );
      }
    }

    const { trackingMode, ...rest } = dto;
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.unitTypeDefinition.update({
        where: { id: unitTypeId },
        data: rest,
      });

      // Switching INTO AUTO resyncs immediately so counts reflect reality
      // rather than whatever stale MANUAL numbers were sitting there.
      if (trackingMode === 'AUTO' && before.trackingMode === 'MANUAL') {
        await tx.unitTypeDefinition.update({
          where: { id: unitTypeId },
          data: { trackingMode: 'AUTO' },
        });
        await this.syncCountsTx(tx, unitTypeId);
      } else if (trackingMode) {
        await tx.unitTypeDefinition.update({
          where: { id: unitTypeId },
          data: { trackingMode },
        });
      }
      return tx.unitTypeDefinition.findUnique({ where: { id: unitTypeId } });
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'UNIT_TYPE_UPDATED',
      entityType: 'UnitTypeDefinition',
      entityId: unitTypeId,
      previousValue: before,
      newValue: updated,
    });

    return updated;
  }

  async remove(userId: string, organizationId: string, propertyId: string, unitTypeId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    const unitType = await this.getOwnedUnitType(organizationId, propertyId, unitTypeId);

    const activeTenancies = await this.prisma.tenancy.count({
      where: { unit: { unitTypeId }, status: { in: ['ACTIVE', 'PENDING'] } },
    });
    if (activeTenancies > 0) {
      throw new ConflictException(
        'This unit type still has active or pending tenancies. Terminate them before archiving the type.',
      );
    }

    const archived = await this.prisma.unitTypeDefinition.update({
      where: { id: unitTypeId },
      data: { deletedAt: new Date(), isPubliclyListable: false },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'UNIT_TYPE_ARCHIVED',
      entityType: 'UnitTypeDefinition',
      entityId: unitTypeId,
    });

    return archived;
  }

  // ── Vacancy stepper (MANUAL) ───────────────────────────────────────

  /**
   * Landlord +/- stepper. AUTO-tracked types reject this — their vacancy
   * is derived from lease records (resync instead). Applies the delta
   * atomically with bounds [0, totalCount] so parallel taps can never
   * under/over-shoot.
   */
  async adjustVacancy(
    userId: string,
    organizationId: string,
    propertyId: string,
    unitTypeId: string,
    delta: number,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    const unitType = await this.getOwnedUnitType(organizationId, propertyId, unitTypeId);

    if (delta === 0) {
      return { unitTypeId, before: unitType.vacantCount, after: unitType.vacantCount, applied: false };
    }
    if (unitType.trackingMode === 'AUTO') {
      throw new BadRequestException(
        'Vacancy for AUTO-tracked unit types is derived from unit and tenancy records. Use the resync action (or add/remove units) instead of the stepper.',
      );
    }

    const snapshots: CountSnapshot[] = [];
    await this.prisma.$transaction(async (tx) => {
      snapshots.push(await this.adjustVacancyTx(tx, unitType, delta));
    });

    const snapshot = snapshots[0];
    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'UNIT_TYPE_VACANCY_ADJUSTED',
      entityType: 'UnitTypeDefinition',
      entityId: unitTypeId,
      newValue: { delta, before: snapshot.before, after: snapshot.after },
    });
    await this.maybeAlertLowVacancy(unitTypeId, snapshot.before, snapshot.after);

    return { unitTypeId, before: snapshot.before, after: snapshot.after, applied: true };
  }

  /**
   * Bulk stepper (used by CSV-style stock imports). AUTO-tracked entries
   * are skipped and reported rather than failing the whole batch.
   */
  async bulkAdjustVacancy(
    userId: string,
    organizationId: string,
    propertyId: string,
    items: { unitTypeId: string; delta: number }[],
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    await this.getOwnedProperty(organizationId, propertyId);

    const ids = items.map((i) => i.unitTypeId);
    const types = await this.prisma.unitTypeDefinition.findMany({
      where: { id: { in: ids }, propertyId, deletedAt: null },
    });
    const byId = new Map(types.map((t) => [t.id, t]));

    const applied: CountSnapshot[] = [];
    const skipped: { unitTypeId: string; reason: string }[] = [];

    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        const type = byId.get(item.unitTypeId);
        if (!type) {
          skipped.push({ unitTypeId: item.unitTypeId, reason: 'Unknown unit type' });
          continue;
        }
        if (type.trackingMode === 'AUTO') {
          skipped.push({
            unitTypeId: item.unitTypeId,
            reason: 'AUTO-tracked — vacancy derived from lease records',
          });
          continue;
        }
        if (item.delta === 0) continue;
        applied.push(await this.adjustVacancyTx(tx, type, item.delta));
      }
    });

    for (const snapshot of applied) {
      await this.audit.log({
        organizationId,
        actorUserId: userId,
        action: 'UNIT_TYPE_VACANCY_ADJUSTED',
        entityType: 'UnitTypeDefinition',
        entityId: snapshot.unitTypeId,
        newValue: { bulk: true, before: snapshot.before, after: snapshot.after },
      });
      await this.maybeAlertLowVacancy(snapshot.unitTypeId, snapshot.before, snapshot.after);
    }

    return { applied, skipped };
  }

  // Applies an atomic, bounds-guarded delta inside an existing transaction.
  private async adjustVacancyTx(tx: Tx, type: { id: string; totalCount: number; vacantCount: number }, delta: number) {
    if (type.totalCount === 0 && delta > 0) {
      throw new ConflictException(
        'Cannot increase vacancy past totalCount. Add stock (totalCount) first.',
      );
    }
    const guarded = await tx.unitTypeDefinition.updateMany({
      where: {
        id: type.id,
        deletedAt: null,
        vacantCount: { gte: -delta, lte: type.totalCount - delta },
      },
      data: { vacantCount: { increment: delta } },
    });
    if (guarded.count !== 1) {
      throw new ConflictException(
        `Vacancy would exceed [0, ${type.totalCount}]. Use the resync action or adjust totalCount first.`,
      );
    }
    const after = await tx.unitTypeDefinition.findUnique({
      where: { id: type.id },
      select: { vacantCount: true },
    });
    return { unitTypeId: type.id, before: type.vacantCount, after: after?.vacantCount ?? type.vacantCount };
  }

  // ── Resync (AUTO) ──────────────────────────────────────────────────

  /**
   * Recompute an AUTO-tracked type's counts from its physical units minus
   * active soft holds. Returns the before/after snapshot. Idempotent.
   */
  async syncCountsTx(tx: Tx, unitTypeId: string): Promise<CountSnapshot> {
    const type = await tx.unitTypeDefinition.findUnique({
      where: { id: unitTypeId },
      select: { id: true, trackingMode: true, vacantCount: true },
    });
    if (!type) throw new NotFoundException('Unit type not found');
    if (type.trackingMode === 'MANUAL') {
      return { unitTypeId, before: type.vacantCount, after: type.vacantCount };
    }

    const now = new Date();
    const [totalRaw, vacantRaw, activeHolds] = await Promise.all([
      tx.unit.count({ where: { unitTypeId, deletedAt: null } }),
      tx.unit.count({
        where: {
          unitTypeId,
          deletedAt: null,
          availabilityStatus: { in: ['VACANT', 'AVAILABLE'] },
        },
      }),
      tx.propertyInquiry.count({
        where: {
          unitTypeId,
          reservedAt: { not: null },
          holdReleasedAt: null,
          reservationExpiresAt: { gt: now },
        },
      }),
    ]);

    const total = totalRaw;
    const vacant = Math.max(0, vacantRaw - activeHolds);

    await tx.unitTypeDefinition.update({
      where: { id: unitTypeId },
      data: { totalCount: total, vacantCount: vacant },
    });

    return { unitTypeId, before: type.vacantCount, after: vacant };
  }

  async resync(userId: string, organizationId: string, propertyId: string, unitTypeId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    const unitType = await this.getOwnedUnitType(organizationId, propertyId, unitTypeId);

    const snapshot = await this.prisma.$transaction((tx) => this.syncCountsTx(tx, unitTypeId));
    const current = await this.prisma.unitTypeDefinition.findUnique({
      where: { id: unitTypeId },
      select: { totalCount: true, vacantCount: true },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'UNIT_TYPE_COUNTS_SYNCED',
      entityType: 'UnitTypeDefinition',
      entityId: unitTypeId,
      newValue: snapshot,
    });

    return {
      unitTypeId,
      trackingMode: unitType.trackingMode,
      resynced: unitType.trackingMode === 'AUTO',
      totalCount: current?.totalCount ?? unitType.totalCount,
      vacantCount: current?.vacantCount ?? unitType.vacantCount,
    };
  }

  async resyncAll(userId: string, organizationId: string, propertyId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    await this.getOwnedProperty(organizationId, propertyId);
    return this.resyncAllAuto(propertyId);
  }

  /** Global reconciler path (no auth): resync every AUTO-tracked type. */
  async resyncAllAuto(propertyId?: string) {
    const autoTypes = await this.prisma.unitTypeDefinition.findMany({
      where: {
        deletedAt: null,
        trackingMode: 'AUTO',
        ...(propertyId ? { propertyId } : {}),
      },
      select: { id: true },
    });

    const snapshots = await this.prisma.$transaction(async (tx) => {
      const out: CountSnapshot[] = [];
      for (const t of autoTypes) out.push(await this.syncCountsTx(tx, t.id));
      return out;
    });

    return { resynced: snapshots.length };
  }

  // ── Materialise a physical unit (lease anchor) ─────────────────────

  /**
   * Some MANUAL-tracked types have no physical Unit records (pure stock).
   * When a specific tenant needs a lease anchor, this creates one physical
   * Unit row under the type so tenancy/invitation flows (which key on
   * unitId) keep working unchanged.
   */
  async materializeUnit(userId: string, organizationId: string, propertyId: string, unitTypeId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    const unitType = await this.getOwnedUnitType(organizationId, propertyId, unitTypeId);

    const slug = unitType.typeName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'unit';

    let unitNumber = '';
    for (let i = 1; i <= 1000; i += 1) {
      const candidate = `${slug}-${i}`;
      const existing = await this.prisma.unit.findFirst({
        where: { propertyId, unitNumber: candidate },
        select: { id: true },
      });
      if (!existing) {
        unitNumber = candidate;
        break;
      }
    }
    if (!unitNumber) throw new ConflictException('Could not generate a free unit number');

    const unit = await this.prisma.$transaction(async (tx) => {
      const created = await tx.unit.create({
        data: {
          propertyId,
          buildingId: unitType.buildingId,
          unitNumber,
          unitTypeId,
          baseRent: unitType.baseRent,
          depositAmount: unitType.depositAmount,
          description: unitType.description,
          amenities: unitType.amenities,
          bedrooms: unitType.bedrooms ?? undefined,
          bathrooms: unitType.bathrooms ?? undefined,
          sizeSqm: unitType.sizeSqm,
          isPubliclyListable: false,
          listIndividually: false,
        },
      });
      if (unitType.trackingMode === 'AUTO') {
        await this.syncCountsTx(tx, unitTypeId);
      }
      return created;
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'UNIT_MATERIALIZED',
      entityType: 'Unit',
      entityId: unit.id,
      newValue: { unitTypeId },
    });

    return unit;
  }

  // ── Integration with unit/tenancy lifecycle ───────────────────────

  /** Called inside the unit-creation transaction. AUTO types resync so a
   *  new physical unit (stock) shows up in total/vacant automatically. */
  async onUnitCreatedTx(tx: Tx, unitId: string): Promise<CountSnapshot | null> {
    const unit = await tx.unit.findFirst({
      where: { id: unitId },
      select: { unitTypeId: true },
    });
    if (!unit?.unitTypeId) return null;
    const type = await tx.unitTypeDefinition.findUnique({
      where: { id: unit.unitTypeId },
      select: { trackingMode: true },
    });
    if (type?.trackingMode !== 'AUTO') return null;
    return this.syncCountsTx(tx, unit.unitTypeId);
  }

  /** Called inside the unit-archive transaction. AUTO types resync so the
   *  archived unit leaves total/vacant. */
  async onUnitArchivedTx(tx: Tx, unitId: string): Promise<CountSnapshot | null> {
    const unit = await tx.unit.findFirst({
      where: { id: unitId },
      select: { unitTypeId: true },
    });
    if (!unit?.unitTypeId) return null;
    return this.syncCountsTx(tx, unit.unitTypeId);
  }

  /** Called inside the tenancy-creation transaction (both direct create and
   *  invitation acceptance). AUTO: resyncs derived counts (the new lease
   *  marks the unit OCCUPIED/RESERVED, so vacancy drops). MANUAL:
   *  decrements the declared vacancy by one clamped into bounds. */
  async onTenancyCreated(tx: Tx, unitId: string): Promise<CountSnapshot | null> {
    const unit = await tx.unit.findFirst({
      where: { id: unitId },
      select: { unitTypeId: true },
    });
    if (!unit?.unitTypeId) return null;

    const type = await tx.unitTypeDefinition.findUnique({
      where: { id: unit.unitTypeId },
      select: { id: true, trackingMode: true, totalCount: true, vacantCount: true },
    });
    if (!type) return null;

    if (type.trackingMode === 'AUTO') {
      return this.syncCountsTx(tx, type.id);
    }
    try {
      return await this.adjustVacancyTx(tx, type, -1);
    } catch (err) {
      // Already declared 0 vacant — a lease was created anyway. Clamp:
      // don't let tenancy creation fail because of a stale stepper count.
      if (err instanceof ConflictException) {
        return { unitTypeId: type.id, before: type.vacantCount, after: type.vacantCount };
      }
      throw err;
    }
  }

  /** Mirror of onTenancyCreated for termination — releases the slot. */
  async onTenancyTerminated(tx: Tx, unitId: string): Promise<CountSnapshot | null> {
    const unit = await tx.unit.findFirst({
      where: { id: unitId },
      select: { unitTypeId: true },
    });
    if (!unit?.unitTypeId) return null;

    const type = await tx.unitTypeDefinition.findUnique({
      where: { id: unit.unitTypeId },
      select: { id: true, trackingMode: true, totalCount: true, vacantCount: true },
    });
    if (!type) return null;

    if (type.trackingMode === 'AUTO') {
      return this.syncCountsTx(tx, type.id);
    }
    try {
      return await this.adjustVacancyTx(tx, type, 1);
    } catch (err) {
      if (err instanceof ConflictException) {
        return { unitTypeId: type.id, before: type.vacantCount, after: type.vacantCount };
      }
      throw err;
    }
  }

  // ── Soft holds (inquiries) ─────────────────────────────────────────

  /**
   * Landlord marks an inquiry CONVERTED — hold one vacancy for 30 minutes.
   * Throws ConflictException if the type is fully booked. Runs inside the
   * caller's transaction.
   */
  async acquireHoldTx(tx: Tx, inquiryId: string, unitTypeId: string) {
    const type = await tx.unitTypeDefinition.findUnique({
      where: { id: unitTypeId },
      select: { id: true, trackingMode: true, totalCount: true, vacantCount: true },
    });
    if (!type || type.totalCount === 0) {
      throw new ConflictException('This unit type has no stock to hold');
    }

    const now = new Date();
    if (type.trackingMode === 'AUTO') {
      const before = await this.syncCountsTx(tx, type.id);
      if (before.after < 1) {
        throw new ConflictException('This unit type is fully booked right now');
      }
      await tx.propertyInquiry.update({
        where: { id: inquiryId },
        data: { reservedAt: now, reservationExpiresAt: new Date(now.getTime() + VACANCY_HOLD_MS) },
      });
      const after = await this.syncCountsTx(tx, type.id);
      return { unitTypeId, before: before.after, after: after.after };
    }

    const snapshot = await this.adjustVacancyTx(tx, type, -1);
    await tx.propertyInquiry.update({
      where: { id: inquiryId },
      data: { reservedAt: now, reservationExpiresAt: new Date(now.getTime() + VACANCY_HOLD_MS) },
    });
    return snapshot;
  }

  /** Give a hold back (landlord drops the inquiry, or the slot converts and
   *  the release is desired). Runs inside the caller's transaction. */
  async releaseHoldTx(tx: Tx, inquiry: { id: string; unitTypeId: string | null }) {
    if (!inquiry.unitTypeId) return null;

    const type = await tx.unitTypeDefinition.findUnique({
      where: { id: inquiry.unitTypeId },
      select: { id: true, trackingMode: true, totalCount: true, vacantCount: true },
    });
    if (!type) return null;

    const before = type.vacantCount;
    await tx.propertyInquiry.updateMany({
      where: { id: inquiry.id, holdReleasedAt: null },
      data: { holdReleasedAt: new Date() },
    });

    if (type.trackingMode === 'MANUAL') {
      try {
        return await this.adjustVacancyTx(tx, type, 1);
      } catch (err) {
        if (err instanceof ConflictException) {
          return { unitTypeId: type.id, before, after: type.totalCount };
        }
        throw err;
      }
    }
    return this.syncCountsTx(tx, type.id);
  }

  /**
   * Give back every expired hold (reconciler + lazy release before
   * marketplace reads). Prevents expired reservations from depressing
   * vacancy counts indefinitely.
   */
  async releaseExpiredHolds(): Promise<number> {
    const now = new Date();
    const expired = await this.prisma.propertyInquiry.findMany({
      where: {
        unitTypeId: { not: null },
        holdReleasedAt: null,
        reservationExpiresAt: { lt: now },
      },
      select: { id: true, unitTypeId: true },
    });
    if (!expired.length) return 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.propertyInquiry.updateMany({
        where: { id: { in: expired.map((e) => e.id) }, holdReleasedAt: null },
        data: { holdReleasedAt: now },
      });

      const typeIds = Array.from(new Set(expired.map((e) => e.unitTypeId!)));
      const types = await tx.unitTypeDefinition.findMany({
        where: { id: { in: typeIds } },
        select: { id: true, trackingMode: true, totalCount: true, vacantCount: true },
      });

      for (const t of types) {
        const releasedCount = expired.filter((e) => e.unitTypeId === t.id).length;
        if (releasedCount === 0) continue;
        if (t.trackingMode === 'AUTO') {
          await this.syncCountsTx(tx, t.id);
        } else {
          try {
            await this.adjustVacancyTx(tx, t, releasedCount);
          } catch {
            // Clamp merge: hold gave back more than declared capacity.
            await tx.unitTypeDefinition.update({
              where: { id: t.id },
              data: { vacantCount: t.totalCount },
            });
          }
        }
      }
    });

    for (const q of expired) {
      await this.audit.log({
        organizationId: undefined,
        entityType: 'PropertyInquiry',
        entityId: q.id,
        action: 'VACANCY_HOLD_RELEASED',
        newValue: { reason: 'expired', unitTypeId: q.unitTypeId },
      });
    }

    return expired.length;
  }

  async uploadImage(
    userId: string,
    organizationId: string,
    propertyId: string,
    unitTypeId: string,
    file: Express.Multer.File,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);
    const unitType = await this.getOwnedUnitType(organizationId, propertyId, unitTypeId);

    if (!file) throw new BadRequestException('No image file provided');

    const { url } = await this.storage.saveFile(file, 'unit-types');
    return this.prisma.unitTypeDefinition.update({
      where: { id: unitType.id },
      data: { representativeImage: url },
    });
  }

  // ── Low-vacancy / fully-booked alerts (post-commit) ────────────────

  async maybeAlertLowVacancy(unitTypeId: string, before: number, after: number) {
    if (!Number.isFinite(before) || !Number.isFinite(after) || after >= before) return;
    if (after !== 0 && after > this.lowVacancyThreshold) return;

    const unitType = await this.prisma.unitTypeDefinition.findUnique({
      where: { id: unitTypeId },
      select: {
        id: true,
        typeName: true,
        isPubliclyListable: true,
        property: { select: { name: true, organizationId: true } },
      },
    });
    if (!unitType?.property) return;

    const owner = await this.prisma.organizationMember.findFirst({
      where: { organizationId: unitType.property.organizationId, role: 'OWNER', isActive: true },
      include: { user: { select: { id: true, email: true, phone: true } } },
    });
    if (!owner) return;

    const type = after === 0 ? 'UNIT_TYPE_FULLY_BOOKED' : 'UNIT_TYPE_LOW_VACANCY' as const;
    const title =
      after === 0
        ? 'Unit type fully booked'
        : `${unitType.typeName} is almost full`;
    const body =
      after === 0
        ? `"${unitType.typeName}" at ${unitType.property.name} now has no vacant units.`
        : `Only ${after} of ${
            (await this.prisma.unitTypeDefinition.findUnique({
              where: { id: unitTypeId },
              select: { totalCount: true },
            }))?.totalCount ?? '?'
          } units of "${unitType.typeName}" are still available at ${unitType.property.name}.`;

    await this.notifications.dispatch({
      recipientUserId: owner.user.id,
      organizationId: unitType.property.organizationId,
      type,
      title,
      body,
      data: { unitTypeId, vacantCount: after },
      email: owner.user.email,
      phone: owner.user.phone ?? undefined,
    });
  }
}