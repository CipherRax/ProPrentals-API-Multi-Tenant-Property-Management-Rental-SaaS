import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrgRole, Prisma } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../common/utils/audit.service';
import { LedgerService } from '../ledger/ledger.service';
import { PaymentsService } from '../payments/payments.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { MpesaClientService } from './mpesa-client.service';
import { normalizeMsisdn } from '../common/utils/msisdn.util';
import { InitiateStkPushDto } from '../payments/dto/initiate-stk-push.dto';

const MANAGE_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT', 'CARETAKER'];

interface StkCallbackMetadataItem {
  Name: string;
  Value?: string | number;
}

interface DarajaStkCallbackPayload {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: { Item: StkCallbackMetadataItem[] };
    };
  };
}

@Injectable()
export class MpesaPaymentsService {
  private readonly logger = new Logger(MpesaPaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly payments: PaymentsService,
    private readonly mpesaClient: MpesaClientService,
    private readonly config: ConfigService,
    private readonly receipts: ReceiptsService,
  ) {}

  // ── Initiation (landlord-side, on behalf of a tenant) ──────────────

  async initiateForOrganization(
    userId: string,
    organizationId: string,
    tenancyId: string,
    dto: InitiateStkPushDto,
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!MANAGE_ROLES.includes(membership.role)) {
      throw new ForbiddenException('You are not authorized to initiate payments for this organization');
    }
    const tenancy = await this.prisma.tenancy.findFirst({ where: { id: tenancyId, organizationId } });
    if (!tenancy) throw new NotFoundException('Tenancy not found');

    return this.initiate(tenancy.organizationId, tenancy.id, dto, userId);
  }

  // ── Initiation (tenant self-service, paying their own rent) ────────

  async initiateForMe(userId: string, tenancyId: string, dto: InitiateStkPushDto) {
    const tenancy = await this.prisma.tenancy.findFirst({
      where: { id: tenancyId, tenantProfile: { userId } },
    });
    if (!tenancy) throw new NotFoundException('Tenancy not found');

    return this.initiate(tenancy.organizationId, tenancy.id, dto, userId);
  }

  private async initiate(
    organizationId: string,
    tenancyId: string,
    dto: InitiateStkPushDto,
    initiatedByUserId: string,
  ) {
    const normalizedPhone = normalizeMsisdn(dto.phoneNumber);

    const payment = await this.prisma.payment.create({
      data: {
        organizationId,
        tenancyId,
        amount: dto.amount,
        method: 'MPESA',
        status: 'INITIATED',
        phoneNumber: normalizedPhone,
        initiatedByUserId,
      },
    });

    const stkResponse = await this.mpesaClient.stkPush({
      phoneNumber: normalizedPhone,
      amount: dto.amount,
      accountReference: `Rent-${tenancyId.slice(0, 8)}`,
      transactionDesc: 'Rent payment',
    });

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'PENDING', providerCheckoutId: stkResponse.CheckoutRequestID },
    });

    await this.audit.log({
      organizationId,
      actorUserId: initiatedByUserId,
      action: 'PAYMENT_MPESA_INITIATED',
      entityType: 'Payment',
      entityId: payment.id,
      newValue: { checkoutRequestId: stkResponse.CheckoutRequestID, amount: dto.amount },
    });

    return {
      paymentId: updated.id,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      customerMessage: stkResponse.CustomerMessage,
    };
  }

  // ── Callback (public, called by Safaricom) ─────────────────────────

  /**
   * Always resolve — Safaricom expects HTTP 200 with ResultCode 0
   * regardless of what we did internally, or it will keep retrying the
   * callback. Internal failures are logged, not surfaced to the caller.
   */
  async handleCallback(payload: DarajaStkCallbackPayload) {
    const stkCallback = payload?.Body?.stkCallback;
    if (!stkCallback) {
      this.logger.warn(`Received malformed M-Pesa callback: ${JSON.stringify(payload)}`);
      return { ResultCode: 0, ResultDesc: 'Accepted' };
    }

    const { CheckoutRequestID, ResultCode, ResultDesc } = stkCallback;

    try {
      if (ResultCode !== 0) {
        const claimed = await this.prisma.payment.updateMany({
          where: { providerCheckoutId: CheckoutRequestID, status: 'PENDING' },
          data: { status: 'FAILED', failureReason: ResultDesc, failedAt: new Date(), rawCallbackPayload: payload as unknown as Prisma.InputJsonValue },
        });
        if (claimed.count === 1) {
          this.logger.log(`M-Pesa payment failed for checkout ${CheckoutRequestID}: ${ResultDesc}`);
        }
        return { ResultCode: 0, ResultDesc: 'Accepted' };
      }

      const items = stkCallback.CallbackMetadata?.Item ?? [];
      const getItem = (name: string) => items.find((i) => i.Name === name)?.Value;
      const receiptNumber = String(getItem('MpesaReceiptNumber') ?? '');
      const confirmedAmount = Number(getItem('Amount') ?? 0);

      if (!receiptNumber) {
        this.logger.warn(`M-Pesa success callback missing receipt number: ${JSON.stringify(payload)}`);
        return { ResultCode: 0, ResultDesc: 'Accepted' };
      }

      await this.finalizeSuccessfulPayment(CheckoutRequestID, receiptNumber, confirmedAmount, payload);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        this.logger.warn(`Duplicate M-Pesa receipt number for checkout ${CheckoutRequestID} — already recorded elsewhere`);
      } else {
        this.logger.error(`Error processing M-Pesa callback: ${(err as Error).message}`, (err as Error).stack);
      }
    }

    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  /**
   * Shared by the real Daraja callback and the reconciliation sweep
   * below. receiptNumber/confirmedAmount are optional because the STK
   * status QUERY endpoint (unlike the actual callback) does not return
   * a CallbackMetadata block with the receipt number or confirmed
   * amount — only ResultCode/ResultDesc. When reconciling via query, we
   * fall back to the amount recorded at initiation and leave
   * providerTransactionId unset rather than fabricate a receipt number.
   */
  private async finalizeSuccessfulPayment(
    checkoutRequestId: string,
    receiptNumber: string | undefined,
    confirmedAmount: number | undefined,
    rawPayload?: unknown,
  ) {
    await this.prisma.$transaction(async (tx) => {
      // Atomic single-claim: only proceeds if this checkout is still
      // PENDING, so a duplicate/retried callback for an already-
      // processed payment is a safe no-op (spec §49).
      const claimed = await tx.payment.updateMany({
        where: { providerCheckoutId: checkoutRequestId, status: 'PENDING' },
        data: {
          status: 'SUCCESSFUL',
          providerTransactionId: receiptNumber || undefined,
          confirmedAt: new Date(),
          rawCallbackPayload: rawPayload as Prisma.InputJsonValue | undefined,
        },
      });
      if (claimed.count !== 1) {
        this.logger.log(`M-Pesa checkout ${checkoutRequestId} already processed — ignoring duplicate`);
        return;
      }

      const payment = await tx.payment.findFirst({ where: { providerCheckoutId: checkoutRequestId } });
      if (!payment) return; // unreachable given the claim above

      const amount = confirmedAmount || Number(payment.amount);

      await this.ledger.postEntry(tx, {
        organizationId: payment.organizationId,
        tenancyId: payment.tenancyId,
        entryType: 'PAYMENT',
        direction: 'CREDIT',
        amount,
        description: receiptNumber
          ? `M-Pesa payment (receipt ${receiptNumber})`
          : 'M-Pesa payment (confirmed via status query, receipt number not yet available)',
        relatedPaymentId: payment.id,
      });

      await this.payments.allocatePaymentToCharges(tx, payment.tenancyId, payment.id, amount);

      // Our own Receipt + receiptNumber (spec §20) — distinct from the
      // M-Pesa receipt number above, which is Safaricom's transaction
      // reference and gets stored as Payment.providerTransactionId.
      await this.receipts.issueReceiptForPayment(tx, payment.organizationId, payment.tenancyId, payment.id, amount);

      await this.audit.log({
        organizationId: payment.organizationId,
        action: 'PAYMENT_MPESA_CONFIRMED',
        entityType: 'Payment',
        entityId: payment.id,
        newValue: { receiptNumber, amount },
      });
    });
  }

  // ── Reconciliation sweep for stuck PENDING payments (spec §47/§18) ──

  /**
   * If Safaricom's callback never arrives (network blip, misconfigured
   * callback URL, etc.), a payment could sit PENDING forever. This
   * actively queries Daraja for the real status rather than guessing;
   * only after a long timeout with no resolvable status does it give up
   * and mark the payment FAILED so it doesn't block forever.
   */
  async reconcileStalePendingPayments(): Promise<{ resolved: number; stillPending: number; timedOut: number }> {
    const staleThresholdMs = 5 * 60 * 1000; // 5 minutes
    const giveUpThresholdMs = 24 * 60 * 60 * 1000; // 24 hours

    const stalePayments = await this.prisma.payment.findMany({
      where: {
        status: 'PENDING',
        method: 'MPESA',
        providerCheckoutId: { not: null },
        initiatedAt: { lt: new Date(Date.now() - staleThresholdMs) },
      },
    });

    let resolved = 0;
    let stillPending = 0;
    let timedOut = 0;

    for (const payment of stalePayments) {
      try {
        const result = await this.mpesaClient.queryStkStatus(payment.providerCheckoutId!);
        if (String(result.ResultCode) === '0') {
          // Note: the query endpoint does NOT return a receipt number or
          // confirmed amount the way the real callback does — finalize
          // using the amount recorded at initiation instead.
          await this.finalizeSuccessfulPayment(payment.providerCheckoutId!, undefined, undefined);
          resolved += 1;
        } else if (String(result.ResultCode) !== '1032') {
          // 1032 = "request is still being processed" in Daraja's
          // convention; anything else definitive gets marked FAILED.
          await this.prisma.payment.updateMany({
            where: { id: payment.id, status: 'PENDING' },
            data: { status: 'FAILED', failureReason: result.ResultDesc, failedAt: new Date() },
          });
          resolved += 1;
        } else {
          stillPending += 1;
        }
      } catch (err) {
        this.logger.warn(`STK status query failed for payment ${payment.id}: ${(err as Error).message}`);
        if (Date.now() - payment.initiatedAt.getTime() > giveUpThresholdMs) {
          await this.prisma.payment.updateMany({
            where: { id: payment.id, status: 'PENDING' },
            data: { status: 'FAILED', failureReason: 'Timed out awaiting M-Pesa confirmation', failedAt: new Date() },
          });
          timedOut += 1;
        } else {
          stillPending += 1;
        }
      }
    }

    if (stalePayments.length > 0) {
      this.logger.log(
        `M-Pesa reconciliation: ${resolved} resolved, ${stillPending} still pending, ${timedOut} timed out (of ${stalePayments.length})`,
      );
    }

    return { resolved, stillPending, timedOut };
  }
}
