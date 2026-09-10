import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { BillingFrequency, OrgRole, Prisma, TenancyStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../common/utils/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { NotificationsService } from '../notifications/notifications.service';
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
  private readonly logger = new Logger(TenanciesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly notifications: NotificationsService,
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
  async createTenancyWithinTransaction(tx: Tx, organizationId: string, terms: TenancyTerms) {
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
    if (!tenantProfile)
      throw new NotFoundException('Tenant profile not found in this organization');

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

    // Seed the deposit record too (spec §23) — one per tenancy, tracked
    // from PENDING through to SETTLED. requiredAmount snapshots the
    // agreed deposit at signing, same pattern as Tenancy.depositAmount.
    await tx.securityDeposit.create({
      data: {
        organizationId,
        tenancyId: tenancy.id,
        requiredAmount: terms.depositAmount,
      },
    });

    return tenancy;
  }

  // ── Auto-activation (scheduled daily via BullMQ) ───────────────────

  /**
   * Flips PENDING → ACTIVE for every tenancy whose start date has
   * arrived, then brings the surrounding state (unit availability,
   * tenant profile, rent configuration, security deposit) in line —
   * the exact same invariants createTenancyWithinTransaction establishes
   * for an immediately-active tenancy. This is what closes the gap where
   * a future-dated tenancy sat PENDING forever once its day arrived.
   *
   * The security deposit is created here ONCE for the tenancy's life
   * (deposits are a single one-time payment, unlike rent) and never
   * touched again by this job. The nightly rent-charge job picks the
   * now-ACTIVE tenancy up afterwards for its first period's charge.
   */
  async activateDueTenancies(): Promise<{
    activated: number;
    skipped: number;
    errors: number;
  }> {
    const dueTenancies = await this.prisma.tenancy.findMany({
      where: { status: 'PENDING', startDate: { lte: new Date() } },
      select: {
        id: true,
        organizationId: true,
        unitId: true,
        tenantProfileId: true,
        startDate: true,
        rentAmount: true,
        depositAmount: true,
        paymentDueDay: true,
        billingFrequency: true,
        tenantProfile: {
          select: { userId: true, email: true, phone: true, status: true },
        },
      },
    });

    let activated = 0;
    let skipped = 0;
    let errors = 0;

    for (const tenancy of dueTenancies) {
      try {
        if (tenancy.tenantProfile.status === 'INVITED' || !tenancy.tenantProfile.userId) {
          // A tenant with no account yet can't be upgraded; the
          // invitation acceptance flow will treat the tenancy the same
          // way it already does today.
          skipped += 1;
          continue;
        }

        await this.prisma.$transaction(async (tx) => {
          await tx.tenancy.update({
            where: { id: tenancy.id },
            data: { status: 'ACTIVE' },
          });

          // Derive unit availability from the tenancy outcome — never
          // set independently (spec §9).
          await tx.unit.update({
            where: { id: tenancy.unitId },
            data: { availabilityStatus: 'OCCUPIED', isPubliclyListable: false },
          });

          if (tenancy.tenantProfile.status === 'INVITED') {
            await tx.tenantProfile.update({
              where: { id: tenancy.tenantProfileId },
              data: { status: 'ACTIVE' },
            });
          }

          // Rent configuration must be current or the nightly charge
          // generation would skip this tenancy (spec §13, §49). The
          // seed config created at signing has effectiveFrom =
          // startDate, so once the start date has arrived it is already
          // current — this is purely defensive for unusual states.
          const hasCurrentConfig = await tx.rentConfiguration.findFirst({
            where: {
              tenancyId: tenancy.id,
              effectiveFrom: { lte: new Date() },
              OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
            },
          });
          if (!hasCurrentConfig) {
            await tx.rentConfiguration.create({
              data: {
                tenancyId: tenancy.id,
                organizationId: tenancy.organizationId,
                unitId: tenancy.unitId,
                amount: tenancy.rentAmount,
                billingFrequency: tenancy.billingFrequency,
                paymentDueDay: tenancy.paymentDueDay,
                effectiveFrom: tenancy.startDate,
              },
            });
          }

          // One-time security deposit (spec §23). A deposit is a single
          // charge for the tenancy's whole life, so we only ever make
          // sure it exists — never re-create or re-due it.
          const deposit = await tx.securityDeposit.findUnique({
            where: { tenancyId: tenancy.id },
          });
          if (!deposit) {
            await tx.securityDeposit.create({
              data: {
                organizationId: tenancy.organizationId,
                tenancyId: tenancy.id,
                requiredAmount: tenancy.depositAmount,
              },
            });
          }

          return tenancy;
        });

        // Post-commit, best-effort — a slow/flaky provider must never
        // hold the operation hostage.
        if (tenancy.tenantProfile.userId) {
          await this.notifications.dispatch({
            recipientUserId: tenancy.tenantProfile.userId,
            organizationId: tenancy.organizationId,
            type: 'DEPOSIT_DUE',
            title: 'Security deposit due',
            body: `Your tenancy is now active. Please pay your one-time security deposit of ${Number(tenancy.depositAmount).toLocaleString()} KES.`,
            data: { tenancyId: tenancy.id },
            email: tenancy.tenantProfile.email,
            phone: tenancy.tenantProfile.phone ?? undefined,
          });
        }

        activated += 1;
      } catch (err) {
        errors += 1;
        this.logger.error(
          `Tenancy activation failed for ${tenancy.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Tenancy activation run complete: ${activated} activated, ${skipped} skipped, ${errors} errors (of ${dueTenancies.length} due pending tenancies)`,
    );
    return { activated, skipped, errors };
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

  /**
   * Rent balance and deposit status live in genuinely separate systems
   * (spec §23 vs §15/§73 — see deposits module README note on why they
   * aren't commingled at the data layer). This is the one place they're
   * brought together for a single "how does this tenancy stand
   * financially" view, without either system needing to know about the
   * other.
   */
  async getFinancialSummary(userId: string, organizationId: string, tenancyId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    await this.getOwnedTenancy(organizationId, tenancyId);

    const [rentBalance, deposit] = await Promise.all([
      this.ledger.getBalance(organizationId, tenancyId),
      this.prisma.securityDeposit.findUnique({ where: { tenancyId } }),
    ]);

    return {
      tenancyId,
      rentBalance,
      deposit: deposit
        ? {
            status: deposit.status,
            requiredAmount: deposit.requiredAmount,
            amountPaid: deposit.amountPaid,
            amountHeld:
              Number(deposit.amountPaid) -
              Number(deposit.amountDeducted) -
              Number(deposit.amountRefunded),
          }
        : null,
    };
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
      throw new BadRequestException(`Cannot terminate a tenancy with status ${tenancy.status}`);
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

      // Signal that the deposit now needs processing (spec §23: "when a
      // tenancy ends, the landlord can process the deposit"). Only
      // transitions deposits that actually have money held — a deposit
      // still PENDING (nothing ever paid in) has nothing to process.
      await tx.securityDeposit.updateMany({
        where: { tenancyId, status: { in: ['PARTIALLY_PAID', 'FULLY_PAID'] } },
        data: { status: 'PROCESSING' },
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
