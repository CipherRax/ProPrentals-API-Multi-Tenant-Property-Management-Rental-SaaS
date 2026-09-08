import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DepositStatus, OrgRole } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../common/utils/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RecordDepositPaymentDto } from './dto/record-deposit-payment.dto';
import { ProcessDepositDto } from './dto/process-deposit.dto';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT'];

function statusAfterPayment(requiredAmount: number, amountPaid: number): DepositStatus {
  if (amountPaid <= 0) return 'PENDING';
  return amountPaid >= requiredAmount ? 'FULLY_PAID' : 'PARTIALLY_PAID';
}

@Injectable()
export class DepositsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private async getOwnedDepositByTenancy(organizationId: string, tenancyId: string) {
    const deposit = await this.prisma.securityDeposit.findFirst({
      where: { tenancyId, organizationId },
      include: { transactions: { orderBy: { transactionDate: 'asc' } } },
    });
    if (!deposit) throw new NotFoundException('Security deposit not found for this tenancy');
    return deposit;
  }

  // ── Landlord-facing ─────────────────────────────────────────────────

  async getForTenancy(userId: string, organizationId: string, tenancyId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    return this.getOwnedDepositByTenancy(organizationId, tenancyId);
  }

  async recordPayment(
    userId: string,
    organizationId: string,
    tenancyId: string,
    dto: RecordDepositPaymentDto,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new ForbiddenException(
        'Only owners, property managers, or accountants can record deposit payments',
      );
    }

    const deposit = await this.getOwnedDepositByTenancy(organizationId, tenancyId);
    if (deposit.status === 'PROCESSING' || deposit.status === 'SETTLED') {
      throw new BadRequestException(
        `Cannot record a deposit payment once the deposit is ${deposit.status.toLowerCase()}`,
      );
    }

    const newAmountPaid = Number(deposit.amountPaid) + dto.amount;
    const newStatus = statusAfterPayment(Number(deposit.requiredAmount), newAmountPaid);

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.depositTransaction.create({
        data: {
          depositId: deposit.id,
          type: 'PAYMENT',
          amount: dto.amount,
          manualReference: dto.manualReference,
        },
      });
      return tx.securityDeposit.update({
        where: { id: deposit.id },
        data: { amountPaid: newAmountPaid, status: newStatus },
      });
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'DEPOSIT_PAYMENT_RECORDED',
      entityType: 'SecurityDeposit',
      entityId: deposit.id,
      newValue: { amount: dto.amount, newAmountPaid },
    });

    return updated;
  }

  /**
   * Finalizes a deposit after the tenancy has ended: any number of
   * itemized deductions plus a refund of whatever remains. Deductions
   * and refund together can never exceed what was actually paid in —
   * you cannot deduct money that was never collected (spec §23).
   */
  async process(userId: string, organizationId: string, tenancyId: string, dto: ProcessDepositDto) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new ForbiddenException(
        'Only owners, property managers, or accountants can process deposits',
      );
    }

    const deposit = await this.getOwnedDepositByTenancy(organizationId, tenancyId);
    if (deposit.status !== 'PROCESSING') {
      throw new BadRequestException(
        `Deposit must be in PROCESSING status to settle (currently ${deposit.status}). ` +
          'Terminate the tenancy first — that automatically moves a funded deposit into PROCESSING.',
      );
    }

    const deductions = dto.deductions ?? [];
    const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);
    const refundAmount = dto.refundAmount ?? 0;

    const alreadySettled = Number(deposit.amountDeducted) + Number(deposit.amountRefunded);
    const availableToSettle = Number(deposit.amountPaid) - alreadySettled;

    if (totalDeductions + refundAmount > availableToSettle + 0.001) {
      throw new BadRequestException(
        `Deductions (${totalDeductions}) plus refund (${refundAmount}) exceed the amount still held (${availableToSettle}). ` +
          'You cannot deduct or refund more than was actually paid in.',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const deduction of deductions) {
        await tx.depositTransaction.create({
          data: {
            depositId: deposit.id,
            type: 'DEDUCTION',
            amount: deduction.amount,
            reason: deduction.reason,
            authorizedByUserId: userId,
          },
        });
      }

      if (refundAmount > 0) {
        await tx.depositTransaction.create({
          data: {
            depositId: deposit.id,
            type: 'REFUND',
            amount: refundAmount,
            reason: 'Deposit refund on tenancy settlement',
            authorizedByUserId: userId,
          },
        });
      }

      return tx.securityDeposit.update({
        where: { id: deposit.id },
        data: {
          amountDeducted: Number(deposit.amountDeducted) + totalDeductions,
          amountRefunded: Number(deposit.amountRefunded) + refundAmount,
          status: 'SETTLED',
        },
      });
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'DEPOSIT_SETTLED',
      entityType: 'SecurityDeposit',
      entityId: deposit.id,
      previousValue: deposit,
      newValue: { totalDeductions, refundAmount, deductions },
    });

    const tenancy = await this.prisma.tenancy.findUnique({
      where: { id: tenancyId },
      include: { tenantProfile: { select: { userId: true, email: true, phone: true } } },
    });
    if (tenancy?.tenantProfile?.userId) {
      await this.notifications.dispatch({
        recipientUserId: tenancy.tenantProfile.userId,
        organizationId,
        type: 'DEPOSIT_PROCESSED',
        title: 'Security deposit processed',
        body:
          totalDeductions > 0
            ? `Your security deposit has been processed: ${totalDeductions.toLocaleString()} deducted, ${refundAmount.toLocaleString()} refunded.`
            : `Your security deposit of ${refundAmount.toLocaleString()} has been refunded in full.`,
        data: { tenancyId, depositId: deposit.id },
        email: tenancy.tenantProfile.email,
        phone: tenancy.tenantProfile.phone ?? undefined,
      });
    }

    return updated;
  }

  // ── Tenant-facing self-service ──────────────────────────────────────

  async getMyDeposit(userId: string, tenancyId: string) {
    const deposit = await this.prisma.securityDeposit.findFirst({
      where: { tenancyId, tenancy: { tenantProfile: { userId } } },
      include: { transactions: { orderBy: { transactionDate: 'asc' } } },
    });
    if (!deposit) throw new NotFoundException('Security deposit not found');
    return deposit;
  }
}
