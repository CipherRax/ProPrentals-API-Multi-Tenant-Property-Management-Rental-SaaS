import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../common/utils/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { QueryRentChargesDto } from './dto/query-rent-charges.dto';
import { WaiveRentChargeDto } from './dto/waive-rent-charge.dto';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';
import { computeDueDate, nextBillingPeriod } from '../common/utils/billing-period.util';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT'];

@Injectable()
export class RentChargesService {
  private readonly logger = new Logger(RentChargesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  // ── System-triggered (called from the BullMQ worker, no user context) ─

  /**
   * For every ACTIVE tenancy, generates the next rent charge if its
   * billing period has started and hasn't already been charged.
   * Idempotent: the (tenancyId, billingPeriodStart) unique constraint
   * means a duplicate attempt is a no-op, not a duplicate row — running
   * this twice, or concurrently, is always safe (spec §14, §49).
   */
  async generateChargesForAllActiveTenancies(): Promise<{ created: number; skipped: number; errors: number }> {
    const activeTenancies = await this.prisma.tenancy.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, startDate: true, unitId: true, organizationId: true },
    });

    let created = 0;
    let skipped = 0;
    let errors = 0;

    for (const tenancy of activeTenancies) {
      try {
        const result = await this.generateNextChargeForTenancy(tenancy);
        if (result) created += 1;
        else skipped += 1;
      } catch (err) {
        errors += 1;
        this.logger.error(
          `Rent charge generation failed for tenancy ${tenancy.id}: ${(err as Error).message}`,
        );
      }
    }

    this.logger.log(
      `Rent generation run complete: ${created} created, ${skipped} skipped, ${errors} errors (of ${activeTenancies.length} active tenancies)`,
    );
    return { created, skipped, errors };
  }

  private async generateNextChargeForTenancy(tenancy: {
    id: string;
    startDate: Date;
    unitId: string;
    organizationId: string;
  }) {
    const lastCharge = await this.prisma.rentCharge.findFirst({
      where: { tenancyId: tenancy.id },
      orderBy: { billingPeriodStart: 'desc' },
    });

    const config = await this.prisma.rentConfiguration.findFirst({
      where: {
        tenancyId: tenancy.id,
        effectiveFrom: { lte: new Date() },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: new Date() } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (!config) {
      this.logger.warn(`Tenancy ${tenancy.id} has no current rent configuration — skipping`);
      return null;
    }

    const { start, end } = nextBillingPeriod(
      lastCharge?.billingPeriodEnd ?? null,
      tenancy.startDate,
      config.billingFrequency,
    );

    // Don't generate charges for periods that haven't started yet —
    // running daily means the charge appears automatically once its
    // period actually begins.
    if (start > new Date()) {
      return null;
    }

    try {
      const charge = await this.prisma.$transaction(async (tx) => {
        const created = await tx.rentCharge.create({
          data: {
            organizationId: tenancy.organizationId,
            tenancyId: tenancy.id,
            unitId: tenancy.unitId,
            rentConfigurationId: config.id,
            billingPeriodStart: start,
            billingPeriodEnd: end,
            amount: config.amount,
            dueDate: computeDueDate(start, config.paymentDueDay),
            status: 'UNPAID',
          },
        });

        await this.ledger.postEntry(tx, {
          organizationId: tenancy.organizationId,
          tenancyId: tenancy.id,
          entryType: 'RENT_CHARGE',
          direction: 'DEBIT',
          amount: created.amount,
          description: `Rent charge for ${start.toISOString().slice(0, 10)} – ${end.toISOString().slice(0, 10)}`,
          relatedRentChargeId: created.id,
        });

        return created;
      });

      await this.audit.log({
        organizationId: tenancy.organizationId,
        action: 'RENT_CHARGE_GENERATED',
        entityType: 'RentCharge',
        entityId: charge.id,
        newValue: charge,
      });

      return charge;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Another concurrent run already created this period's charge.
        return null;
      }
      throw err;
    }
  }

  /**
   * Flips UNPAID charges past their due date + grace period to OVERDUE.
   * PAID/PARTIALLY_PAID transitions are out of scope here — those become
   * derived from the Ledger once the next phase lands.
   */
  async detectOverdueCharges(): Promise<{ updated: number }> {
    const candidates = await this.prisma.rentCharge.findMany({
      where: { status: 'UNPAID' },
      include: { rentConfiguration: { select: { gracePeriodDays: true } } },
    });

    const now = new Date();
    const overdueIds = candidates
      .filter((charge) => {
        const graceMs = (charge.rentConfiguration?.gracePeriodDays ?? 0) * 24 * 60 * 60 * 1000;
        return charge.dueDate.getTime() + graceMs < now.getTime();
      })
      .map((c) => c.id);

    if (overdueIds.length === 0) return { updated: 0 };

    await this.prisma.rentCharge.updateMany({
      where: { id: { in: overdueIds } },
      data: { status: 'OVERDUE' },
    });

    this.logger.log(`Marked ${overdueIds.length} rent charge(s) OVERDUE`);
    return { updated: overdueIds.length };
  }

  // ── Landlord-facing ─────────────────────────────────────────────────

  async findAll(userId: string, organizationId: string, query: QueryRentChargesDto) {
    await this.organizations.assertMembership(userId, organizationId);

    const where: Prisma.RentChargeWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.tenancyId ? { tenancyId: query.tenancyId } : {}),
      ...(query.unitId ? { unitId: query.unitId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.rentCharge.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { dueDate: query.sortOrder },
        include: {
          unit: { select: { id: true, unitNumber: true, propertyId: true } },
          tenancy: { select: { id: true, tenantProfileId: true } },
        },
      }),
      this.prisma.rentCharge.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async findOne(userId: string, organizationId: string, rentChargeId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    const charge = await this.prisma.rentCharge.findFirst({
      where: { id: rentChargeId, organizationId },
      include: { unit: true, tenancy: { include: { tenantProfile: true } } },
    });
    if (!charge) throw new NotFoundException('Rent charge not found');
    return charge;
  }

  async waive(
    userId: string,
    organizationId: string,
    rentChargeId: string,
    dto: WaiveRentChargeDto,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new ForbiddenException('Only owners, property managers, or accountants can waive rent charges');
    }

    const charge = await this.prisma.rentCharge.findFirst({
      where: { id: rentChargeId, organizationId },
    });
    if (!charge) throw new NotFoundException('Rent charge not found');
    if (charge.status === 'PAID' || charge.status === 'WAIVED' || charge.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot waive a charge with status ${charge.status}`);
    }

<<<<<<< HEAD
=======
    // Only the remaining unpaid balance is waived — a partially-paid
    // charge (spec §16's PARTIALLY_PAID) must not have its ALREADY-PAID
    // portion also credited back, or the tenant would be over-credited
    // for money they already legitimately paid.
    const remainingBalance = Number(charge.amount) - Number(charge.amountPaid);

>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.rentCharge.update({
        where: { id: rentChargeId },
        data: {
          status: 'WAIVED',
<<<<<<< HEAD
=======
          amountPaid: charge.amount, // fully "settled" from the charge's own perspective
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)
          waivedReason: dto.reason,
          waivedByUserId: userId,
          waivedAt: new Date(),
        },
      });

<<<<<<< HEAD
      // Offset the original RENT_CHARGE debit so the tenant's computed
      // balance reflects the waiver immediately — the original charge
      // and its ledger entry are never edited, only offset.
=======
      // Offset only the remaining balance — the original RENT_CHARGE
      // debit and any PAYMENT credits already posted against it are
      // never edited, only offset.
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)
      await this.ledger.postEntry(tx, {
        organizationId,
        tenancyId: charge.tenancyId,
        entryType: 'WAIVER',
        direction: 'CREDIT',
<<<<<<< HEAD
        amount: charge.amount,
=======
        amount: remainingBalance,
>>>>>>> 4ea4411 (PHASE 7: Receipts & Tenant Statements)
        description: `Waived: ${dto.reason}`,
        relatedRentChargeId: charge.id,
        createdByUserId: userId,
      });

      return result;
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'RENT_CHARGE_WAIVED',
      entityType: 'RentCharge',
      entityId: rentChargeId,
      previousValue: charge,
      newValue: updated,
    });

    return updated;
  }

  // ── Tenant-facing self-service ──────────────────────────────────────

  async getMyCharges(userId: string) {
    return this.prisma.rentCharge.findMany({
      where: { tenancy: { tenantProfile: { userId } } },
      orderBy: { dueDate: 'desc' },
      include: { unit: { select: { id: true, unitNumber: true, propertyId: true } } },
    });
  }
}
