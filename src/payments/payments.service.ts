import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrgRole, Prisma, RentChargeStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../common/utils/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RecordManualPaymentDto } from './dto/record-manual-payment.dto';
import { QueryPaymentsDto } from './dto/query-payments.dto';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT'];

type Tx = Prisma.TransactionClient;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly receipts: ReceiptsService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Core allocation logic, shared by manual payments and confirmed
  // M-Pesa payments alike — this is the ONLY place RentCharge.status
  // moves to PAID/PARTIALLY_PAID, and it only ever does so based on a
  // real successful Payment (spec §16, §73). ──────────────────────────

  async allocatePaymentToCharges(
    tx: Tx,
    tenancyId: string,
    paymentId: string,
    availableAmount: number,
  ): Promise<{ allocatedTotal: number; unappliedAmount: number }> {
    const outstandingCharges = await tx.rentCharge.findMany({
      where: { tenancyId, status: { in: ['UNPAID', 'OVERDUE', 'PARTIALLY_PAID'] } },
      orderBy: { dueDate: 'asc' },
    });

    let remaining = availableAmount;

    for (const charge of outstandingCharges) {
      if (remaining <= 0) break;

      const chargeRemaining = Number(charge.amount) - Number(charge.amountPaid);
      if (chargeRemaining <= 0) continue;

      const allocateAmount = Math.min(chargeRemaining, remaining);
      const newAmountPaid = Number(charge.amountPaid) + allocateAmount;
      const newStatus: RentChargeStatus =
        newAmountPaid >= Number(charge.amount) ? 'PAID' : 'PARTIALLY_PAID';

      await tx.paymentAllocation.create({
        data: { paymentId, rentChargeId: charge.id, amount: allocateAmount },
      });

      await tx.rentCharge.update({
        where: { id: charge.id },
        data: { amountPaid: newAmountPaid, status: newStatus },
      });

      remaining -= allocateAmount;
    }

    // Money left over after every outstanding charge is covered becomes
    // an unapplied tenant credit — visible in the overall ledger balance
    // (it goes negative/credit), but deliberately not force-attached to
    // any specific charge. See README for why per-charge OVERPAID is out
    // of scope for this phase.
    if (remaining > 0) {
      this.logger.log(
        `Payment ${paymentId} left KES ${remaining} unapplied to any specific charge (tenant credit)`,
      );
    }

    return { allocatedTotal: availableAmount - remaining, unappliedAmount: remaining };
  }

  // ── Manual payments (spec §19) ──────────────────────────────────────

  async recordManualPayment(
    userId: string,
    organizationId: string,
    tenancyId: string,
    dto: RecordManualPaymentDto,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new ForbiddenException(
        'Only owners, property managers, or accountants can record manual payments',
      );
    }

    const tenancy = await this.prisma.tenancy.findFirst({
      where: { id: tenancyId, organizationId },
    });
    if (!tenancy) throw new NotFoundException('Tenancy not found');

    const confirmedAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          organizationId,
          tenancyId,
          amount: dto.amount,
          method: dto.method,
          status: 'SUCCESSFUL',
          manualReference: dto.manualReference,
          notes: dto.notes,
          recordedByUserId: userId,
          confirmedAt,
        },
      });

      await this.ledger.postEntry(tx, {
        organizationId,
        tenancyId,
        entryType: 'PAYMENT',
        direction: 'CREDIT',
        amount: dto.amount,
        description: `${dto.method} payment recorded by staff${dto.manualReference ? ` (ref: ${dto.manualReference})` : ''}`,
        relatedPaymentId: created.id,
        createdByUserId: userId,
      });

      await this.allocatePaymentToCharges(tx, tenancyId, created.id, dto.amount);

      const receipt = await this.receipts.issueReceiptForPayment(
        tx,
        organizationId,
        tenancyId,
        created.id,
        dto.amount,
      );

      return { ...created, receiptNumber: receipt.receiptNumber };
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'PAYMENT_RECORDED_MANUAL',
      entityType: 'Payment',
      entityId: payment.id,
      newValue: payment,
    });

    await this.notifyPaymentConfirmed(
      organizationId,
      tenancyId,
      payment.id,
      dto.amount,
      dto.method,
    );

    return payment;
  }

  /**
   * Shared by manual payment recording and the M-Pesa callback handler
   * (MpesaPaymentsService) — post-commit, best-effort, never throws.
   */
  async notifyPaymentConfirmed(
    organizationId: string,
    tenancyId: string,
    paymentId: string,
    amount: number,
    method: string,
  ) {
    const tenancy = await this.prisma.tenancy.findUnique({
      where: { id: tenancyId },
      include: { tenantProfile: { select: { userId: true, email: true, phone: true } } },
    });
    const recipientUserId = tenancy?.tenantProfile?.userId;
    if (!recipientUserId) return;

    await this.notifications.dispatch({
      recipientUserId,
      organizationId,
      type: 'PAYMENT_CONFIRMED',
      title: 'Payment received',
      body: `Your payment of ${amount.toLocaleString()} via ${method} has been received and confirmed. Thank you!`,
      data: { paymentId, tenancyId },
      email: tenancy?.tenantProfile?.email,
      phone: tenancy?.tenantProfile?.phone ?? undefined,
    });
  }

  // ── Landlord-facing ─────────────────────────────────────────────────

  async findAll(userId: string, organizationId: string, query: QueryPaymentsDto) {
    await this.organizations.assertMembership(userId, organizationId);

    const where: Prisma.PaymentWhereInput = {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.tenancyId ? { tenancyId: query.tenancyId } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        skip: paginationSkip(query.page, query.limit),
        take: query.limit,
        orderBy: { createdAt: query.sortOrder },
        include: { allocations: true },
      }),
      this.prisma.payment.count({ where }),
    ]);

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async findOne(userId: string, organizationId: string, paymentId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, organizationId },
      include: { allocations: { include: { rentCharge: true } } },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    return payment;
  }

  // ── Tenant-facing self-service ──────────────────────────────────────

  async getMyPayments(userId: string) {
    return this.prisma.payment.findMany({
      where: { tenancy: { tenantProfile: { userId } } },
      orderBy: { createdAt: 'desc' },
      include: { allocations: true },
    });
  }
}
