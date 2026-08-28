import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { LedgerEntryDirection, LedgerEntryType, OrgRole, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../common/utils/audit.service';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { QueryLedgerDto } from './dto/query-ledger.dto';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT'];

type Tx = Prisma.TransactionClient;

interface PostEntryParams {
  organizationId: string;
  tenancyId: string;
  entryType: LedgerEntryType;
  direction: LedgerEntryDirection;
  amount: number | Prisma.Decimal;
  description?: string;
  relatedRentChargeId?: string;
  createdByUserId?: string;
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
  ) {}

  // ── Core primitive, used both standalone and inside other modules'
  // transactions (e.g. RentChargesService posts RENT_CHARGE/WAIVER
  // entries in the same transaction that creates/waives the charge, so
  // the charge and its ledger entry can never exist independently) ────

  async postEntry(tx: Tx, params: PostEntryParams) {
    return tx.ledgerEntry.create({
      data: {
        organizationId: params.organizationId,
        tenancyId: params.tenancyId,
        entryType: params.entryType,
        direction: params.direction,
        amount: params.amount,
        description: params.description,
        relatedRentChargeId: params.relatedRentChargeId,
        createdByUserId: params.createdByUserId,
      },
    });
  }

  // ── Balance / statement (read-side) ─────────────────────────────────

  /**
   * A tenant's balance is never stored — it's computed here, every time,
   * from the full entry history (spec §73). DEBIT entries increase what
   * they owe; CREDIT entries decrease it.
   */
  async getBalance(organizationId: string, tenancyId: string): Promise<number> {
    const totals = await this.prisma.ledgerEntry.groupBy({
      by: ['direction'],
      where: { organizationId, tenancyId },
      _sum: { amount: true },
    });

    const debit = Number(totals.find((t) => t.direction === 'DEBIT')?._sum.amount ?? 0);
    const credit = Number(totals.find((t) => t.direction === 'CREDIT')?._sum.amount ?? 0);
    return debit - credit;
  }

  async getStatement(userId: string, organizationId: string, tenancyId: string, query: QueryLedgerDto) {
    await this.organizations.assertMembership(userId, organizationId);
    return this.buildStatement(organizationId, tenancyId, query);
  }

  async getMyStatement(userId: string, tenancyId: string, query: QueryLedgerDto) {
    const tenancy = await this.prisma.tenancy.findFirst({
      where: { id: tenancyId, tenantProfile: { userId } },
    });
    if (!tenancy) throw new NotFoundException('Tenancy not found');
    return this.buildStatement(tenancy.organizationId, tenancyId, query);
  }

  private async buildStatement(organizationId: string, tenancyId: string, query: QueryLedgerDto) {
    const tenancy = await this.prisma.tenancy.findFirst({ where: { id: tenancyId, organizationId } });
    if (!tenancy) throw new NotFoundException('Tenancy not found');

    const from = query.from ? new Date(query.from) : tenancy.startDate;
    const to = query.to ? new Date(query.to) : new Date();

    const [openingTotals, periodEntries] = await Promise.all([
      this.prisma.ledgerEntry.groupBy({
        by: ['direction'],
        where: { tenancyId, createdAt: { lt: from } },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.findMany({
        where: { tenancyId, createdAt: { gte: from, lte: to } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const openingDebit = Number(openingTotals.find((t) => t.direction === 'DEBIT')?._sum.amount ?? 0);
    const openingCredit = Number(openingTotals.find((t) => t.direction === 'CREDIT')?._sum.amount ?? 0);
    let runningBalance = openingDebit - openingCredit;

    const entries = periodEntries.map((entry) => {
      const signedAmount = entry.direction === 'DEBIT' ? Number(entry.amount) : -Number(entry.amount);
      runningBalance += signedAmount;
      return { ...entry, signedAmount, runningBalance };
    });

    return {
      tenancyId,
      periodStart: from,
      periodEnd: to,
      openingBalance: openingDebit - openingCredit,
      closingBalance: runningBalance,
      entries,
    };
  }

  async listEntries(userId: string, organizationId: string, tenancyId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    const tenancy = await this.prisma.tenancy.findFirst({ where: { id: tenancyId, organizationId } });
    if (!tenancy) throw new NotFoundException('Tenancy not found');

    return this.prisma.ledgerEntry.findMany({
      where: { tenancyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Manual adjustments (landlord-facing) ────────────────────────────

  async createAdjustment(
    userId: string,
    organizationId: string,
    tenancyId: string,
    dto: CreateAdjustmentDto,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new ForbiddenException(
        'Only owners, property managers, or accountants can post manual ledger adjustments',
      );
    }

    const tenancy = await this.prisma.tenancy.findFirst({ where: { id: tenancyId, organizationId } });
    if (!tenancy) throw new NotFoundException('Tenancy not found');

    const entry = await this.prisma.$transaction((tx) =>
      this.postEntry(tx, {
        organizationId,
        tenancyId,
        entryType: dto.kind === 'CREDIT' ? 'CREDIT_ADJUSTMENT' : 'DEBIT_ADJUSTMENT',
        direction: dto.kind === 'CREDIT' ? 'CREDIT' : 'DEBIT',
        amount: dto.amount,
        description: dto.reason,
        createdByUserId: userId,
      }),
    );

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'LEDGER_ADJUSTMENT_CREATED',
      entityType: 'LedgerEntry',
      entityId: entry.id,
      newValue: entry,
    });

    return entry;
  }

  /**
   * Corrects a mistake by posting an opposite entry that references the
   * original — the original row is never touched (spec §15, §38). Only
   * manual adjustments are reversible through this generic endpoint;
   * system-generated entries (RENT_CHARGE, WAIVER) are corrected through
   * their own domain actions instead (e.g. waiving a charge), since
   * reversing them generically would let the ledger drift out of sync
   * with RentCharge.status.
   */
  async reverseEntry(userId: string, organizationId: string, entryId: string) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new ForbiddenException('Only owners, property managers, or accountants can reverse ledger entries');
    }

    const original = await this.prisma.ledgerEntry.findFirst({
      where: { id: entryId, organizationId },
    });
    if (!original) throw new NotFoundException('Ledger entry not found');

    if (!['CREDIT_ADJUSTMENT', 'DEBIT_ADJUSTMENT'].includes(original.entryType)) {
      throw new BadRequestException(
        `Entries of type ${original.entryType} cannot be reversed through this endpoint`,
      );
    }

    try {
      const reversal = await this.prisma.ledgerEntry.create({
        data: {
          organizationId,
          tenancyId: original.tenancyId,
          entryType: original.entryType,
          direction: original.direction === 'DEBIT' ? 'CREDIT' : 'DEBIT',
          amount: original.amount,
          description: `Reversal of entry ${original.id}${original.description ? `: ${original.description}` : ''}`,
          reversesEntryId: original.id,
          createdByUserId: userId,
        },
      });

      await this.audit.log({
        organizationId,
        actorUserId: userId,
        action: 'LEDGER_ENTRY_REVERSED',
        entityType: 'LedgerEntry',
        entityId: reversal.id,
        previousValue: original,
        newValue: reversal,
      });

      return reversal;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('This entry has already been reversed');
      }
      throw err;
    }
  }
}
