import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BillingFrequency, OrgRole, Prisma, TenancyStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../common/utils/audit.service';
import { CreateTenancyDto } from './dto/create-tenancy.dto';
import { TerminateTenancyDto } from './dto/terminate-tenancy.dto';
import { QueryTenanciesDto } from './dto/query-tenancies.dto';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER'];

type Tx = Prisma.TransactionClient;

interface TenancyTerms {
  unitId: string;
  tenantProfileId: string;
  startDate: Date;
  rentAmount: number;
  depositAmount: number;
  paymentDueDay?: number;
  billingFrequency?: BillingFrequency;
  agreementUrl?: string;
  notes?: string;
}

@Injectable()
export class TenanciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
  ) {}

  private assertCanManage(role: OrgRole) {
    if (!MANAGE_ROLES.includes(role)) {
      throw new ForbiddenException('Only owners or property managers can manage tenancies');
    }
  }

  // ── Core state-machine logic, reused by both the direct-creation
  // endpoint below and the tenant-invitation acceptance flow ──────────

  /**
   * Creates a tenancy inside an existing transaction. Enforces spec §72
   * rule 1 (a unit cannot have two active/pending tenancies at once) and
   * derives the unit's availabilityStatus + the tenant profile's status
   * from the outcome — the two are never set independently.
   */
  async createTenancyWithinTransaction(
    tx: Tx,
    organizationId: string,
    terms: TenancyTerms,
  ) {
    const unit = await tx.unit.findFirst({
      where: { id: terms.unitId, deletedAt: null, property: { organizationId } },
    });
    if (!unit) throw new NotFoundException('Unit not found in this organization');

    const conflicting = await tx.tenancy.findFirst({
      where: { unitId: terms.unitId, status: { in: ['ACTIVE', 'PENDING'] } },
    });
    if (conflicting) {
      throw new ConflictException(
        'This unit already has an active or pending tenancy. Terminate it before creating a new one.',
      );
    }

    const tenantProfile = await tx.tenantProfile.findFirst({
      where: { id: terms.tenantProfileId, organizationId, deletedAt: null },
    });
    if (!tenantProfile) throw new NotFoundException('Tenant profile not found in this organization');

    const isImmediatelyActive = terms.startDate <= new Date();
    const tenancyStatus: TenancyStatus = isImmediatelyActive ? 'ACTIVE' : 'PENDING';

    const tenancy = await tx.tenancy.create({
      data: {
        organizationId,
        unitId: terms.unitId,
        tenantProfileId: terms.tenantProfileId,
        startDate: terms.startDate,
        rentAmount: terms.rentAmount,
        depositAmount: terms.depositAmount,
        paymentDueDay: terms.paymentDueDay ?? 5,
        billingFrequency: terms.billingFrequency ?? 'MONTHLY',
        agreementUrl: terms.agreementUrl,
        notes: terms.notes,
        status: tenancyStatus,
      },
    });

    // Derive unit availability from the tenancy outcome — never set
    // independently of it (spec §9: don't confuse listing availability
    // with actual occupancy).
    await tx.unit.update({
      where: { id: terms.unitId },
      data: {
        availabilityStatus: isImmediatelyActive ? 'OCCUPIED' : 'RESERVED',
        isPubliclyListable: false,
      },
    });

    if (tenantProfile.status === 'INVITED') {
      await tx.tenantProfile.update({
        where: { id: tenantProfile.id },
        data: { status: 'ACTIVE' },
      });
    }

    // Seed the initial rent configuration from the agreed terms. This
    // becomes the single source of truth the rent-generation job reads
    // from (Phase 4) — Tenancy.rentAmount stays as the immutable
    // "at signing" snapshot for reference, while RentConfiguration is
    // what actually changes over time (spec §13).
    await tx.rentConfiguration.create({
      data: {
        tenancyId: tenancy.id,
        organizationId,
        unitId: terms.unitId,
        amount: terms.rentAmount,
        billingFrequency: terms.billingFrequency ?? 'MONTHLY',
        paymentDueDay: terms.paymentDueDay ?? 5,
        effectiveFrom: terms.startDate,
      },
    });

    return tenancy;
  }

  // ── Direct creation (landlord re-letting to an existing tenant) ────

  async create(userId: string, organizationId: string, dto: CreateTenancyDto) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);

    const tenancy = await this.prisma.$transaction((tx) =>
      this.createTenancyWithinTransaction(tx, organizationId, {
        unitId: dto.unitId,
        tenantProfileId: dto.tenantProfileId,
        startDate: new Date(dto.startDate),
        rentAmount: dto.rentAmount,
        depositAmount: dto.depositAmount,
        paymentDueDay: dto.paymentDueDay,
        billingFrequency: dto.billingFrequency,
        agreementUrl: dto.agreementUrl,
        notes: dto.notes,
      }),
    );

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'TENANCY_CREATED',
      entityType: 'Tenancy',
      entityId: tenancy.id,
      newValue: tenancy,
    });

    return tenancy;
  }

  async findAll(userId: string, organizationId: string, query: QueryTenanciesDto) {
    await this.organizations.assertMembership(userId, organizationId);

    const where: Prisma.TenancyWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(query.propertyId ? { unit: { propertyId: query.propertyId } } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.tenancy.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { createdAt: query.sortOrder },
        include: {
          unit: { select: { id: true, unitNumber: true, propertyId: true } },
          tenantProfile: { select: { id: true, fullName: true, email: true, phone: true } },
        },
      }),
      this.prisma.tenancy.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async findOne(userId: string, organizationId: string, tenancyId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    return this.getOwnedTenancy(organizationId, tenancyId, {
      unit: true,
      tenantProfile: true,
    });
  }

  async terminate(
    userId: string,
    organizationId: string,
    tenancyId: string,
    dto: TerminateTenancyDto,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    this.assertCanManage(membership.role);

    const tenancy = await this.getOwnedTenancy(organizationId, tenancyId);
    if (tenancy.status !== 'ACTIVE' && tenancy.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot terminate a tenancy with status ${tenancy.status}`,
      );
    }

    const terminationDate = new Date(dto.terminationDate);

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.tenancy.update({
        where: { id: tenancyId },
        data: {
          status: 'TERMINATED',
          endDate: terminationDate,
          terminationDate,
          terminationReason: dto.terminationReason,
          notes: dto.notes ?? tenancy.notes,
        },
      });

      // Vacate the unit — this is the only place OCCUPIED/RESERVED gets
      // cleared, keeping unit availability strictly derived from tenancy
      // state (spec §9).
      await tx.unit.update({
        where: { id: tenancy.unitId },
        data: { availabilityStatus: 'VACANT' },
      });

      // Close out the current rent configuration so the historical
      // pricing record accurately reflects that rent stopped applying at
      // termination, rather than looking like it's still "current".
      await tx.rentConfiguration.updateMany({
        where: { tenancyId, effectiveTo: null },
        data: { effectiveTo: terminationDate },
      });

      return result;
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'TENANCY_TERMINATED',
      entityType: 'Tenancy',
      entityId: tenancyId,
      previousValue: tenancy,
      newValue: updated,
    });

    return updated;
  }

  // ── Tenant-facing self-service ──────────────────────────────────────

  async getMyTenancies(userId: string) {
    return this.prisma.tenancy.findMany({
      where: { tenantProfile: { userId } },
      orderBy: { createdAt: 'desc' },
      include: {
        unit: { select: { id: true, unitNumber: true, propertyId: true } },
      },
    });
  }

  private async getOwnedTenancy(
    organizationId: string,
    tenancyId: string,
    include?: Prisma.TenancyInclude,
  ) {
    const tenancy = await this.prisma.tenancy.findFirst({
      where: { id: tenancyId, organizationId },
      include,
    });
    if (!tenancy) throw new NotFoundException('Tenancy not found');
    return tenancy;
  }
}
