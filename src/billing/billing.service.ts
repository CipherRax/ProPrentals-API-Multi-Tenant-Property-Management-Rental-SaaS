import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrgRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { AuditService } from '../common/utils/audit.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { MpesaClientService } from '../mpesa/mpesa-client.service';
import { NotificationsService } from '../notifications/notifications.service';
import { normalizeMsisdn } from '../common/utils/msisdn.util';

const OWNER_ROLES: OrgRole[] = ['OWNER'];
const PAYMENT_ROLES: OrgRole[] = ['OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT'];

/**
 * Platform billing (spec §36) — completely separate financial domain from
 * rent payments. Landlords pay the SaaS platform here; tenants pay
 * landlords through the rent Payment module. Separate models, separate
 * services, separate business logic — never commingled.
 */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly organizations: OrganizationsService,
    private readonly audit: AuditService,
    private readonly subscriptions: SubscriptionsService,
    private readonly mpesaClient: MpesaClientService,
    private readonly notifications: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  // ── Manual payment recording (e.g. bank transfer of subscription) ──

  async recordManualSubscriptionPayment(
    userId: string,
    organizationId: string,
    dto: {
      tier: string;
      amount: number;
      manualReference?: string;
      notes?: string;
      paidAt?: string;
    },
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!PAYMENT_ROLES.includes(membership.role)) {
      throw new ForbiddenException(
        'Only owners, property managers, or accountants can record subscription payments',
      );
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { tier: dto.tier as never },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');

    const subscription = await this.subscriptions.ensureSubscriptionExists(
      this.prisma,
      organizationId,
    );
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    const payment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.subscriptionPayment.create({
        data: {
          organizationId,
          subscriptionId: subscription?.id,
          planId: plan.id,
          tier: plan.tier,
          amount: dto.amount,
          currency: 'KES',
          status: 'SUCCESSFUL',
          provider: 'MANUAL',
          manualReference: dto.manualReference,
          notes: dto.notes,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          paidAt,
          initiatedByUserId: userId,
        },
      });

      // Advance the subscription state in the same transaction.
      await tx.subscription.upsert({
        where: { organizationId },
        update: {
          status: 'ACTIVE',
          nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          planId: plan.id,
          tier: plan.tier,
          renewalDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        create: {
          organizationId,
          planId: plan.id,
          tier: plan.tier,
          status: 'ACTIVE',
          startDate: new Date(),
          nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });

      await tx.organization.update({
        where: { id: organizationId },
        data: { subscriptionPlan: plan.tier, subscriptionStatus: 'ACTIVE' },
      });

      return created;
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'SUBSCRIPTION_PAYMENT_RECORDED',
      entityType: 'SubscriptionPayment',
      entityId: payment.id,
      newValue: payment,
    });

    return payment;
  }

  // ── M-Pesa STK push for subscription (landlord pays platform) ───────

  async initiateSubscriptionStkPush(
    userId: string,
    organizationId: string,
    dto: { tier: string; amount: number; phoneNumber: string },
  ) {
    const membership = await this.organizations.assertMembership(userId, organizationId);
    if (!OWNER_ROLES.includes(membership.role)) {
      throw new ForbiddenException('Only the owner can pay the subscription via M-Pesa');
    }

    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { tier: dto.tier as never },
    });
    if (!plan) throw new NotFoundException('Subscription plan not found');

    const normalizedPhone = normalizeMsisdn(dto.phoneNumber);
    const subscription = await this.subscriptions.ensureSubscriptionExists(
      this.prisma,
      organizationId,
    );

    const payment = await this.prisma.subscriptionPayment.create({
      data: {
        organizationId,
        subscriptionId: subscription?.id,
        planId: plan.id,
        tier: plan.tier,
        amount: dto.amount,
        currency: 'KES',
        status: 'INITIATED',
        provider: 'MPESA',
        initiatedByUserId: userId,
      },
    });

    const stkResponse = await this.mpesaClient.stkPush({
      phoneNumber: normalizedPhone,
      amount: dto.amount,
      accountReference: `Sub-${organizationId.slice(0, 8)}`,
      transactionDesc: 'Habita subscription payment',
    });

    await this.prisma.subscriptionPayment.update({
      where: { id: payment.id },
      data: { status: 'PENDING', providerCheckoutId: stkResponse.CheckoutRequestID },
    });

    await this.audit.log({
      organizationId,
      actorUserId: userId,
      action: 'SUBSCRIPTION_MPESA_INITIATED',
      entityType: 'SubscriptionPayment',
      entityId: payment.id,
      newValue: { checkoutRequestId: stkResponse.CheckoutRequestID, amount: dto.amount },
    });

    return {
      paymentId: payment.id,
      checkoutRequestId: stkResponse.CheckoutRequestID,
      customerMessage: stkResponse.CustomerMessage,
    };
  }

  // ── Fetch a subscription payment (used by the web to poll M-Pesa status) ──

  async getSubscriptionPayment(userId: string, organizationId: string, paymentId: string) {
    await this.organizations.assertMembership(userId, organizationId);
    const payment = await this.prisma.subscriptionPayment.findFirst({
      where: { id: paymentId, organizationId },
    });
    if (!payment) throw new NotFoundException('Subscription payment not found');
    return payment;
  }

  // ── Callback confirmation (idempotent, routed from MpesaCallbackController) ──

  async handleCallback(payload: {
    Body?: {
      stkCallback?: {
        CheckoutRequestID: string;
        ResultCode: number;
        ResultDesc: string;
        CallbackMetadata?: { Item: Array<{ Name: string; Value?: string | number }> };
      };
    };
  }) {
    const stkCallback = payload?.Body?.stkCallback;
    if (!stkCallback) return false;
    const { CheckoutRequestID, ResultCode, ResultDesc } = stkCallback;

    const payment = await this.prisma.subscriptionPayment.findFirst({
      where: { providerCheckoutId: CheckoutRequestID, status: 'PENDING' },
    });
    if (!payment) return false; // not ours — let the rent payment path handle it

    try {
      if (ResultCode !== 0) {
        await this.prisma.subscriptionPayment.updateMany({
          where: { providerCheckoutId: CheckoutRequestID, status: 'PENDING' },
          data: { status: 'FAILED', failureReason: ResultDesc, paidAt: undefined },
        });
        await this.notifyOwner(
          payment.organizationId,
          'SUBSCRIPTION_PAYMENT_FAILED',
          'Subscription payment failed',
          ResultDesc,
        );
        return true;
      }

      const items = stkCallback.CallbackMetadata?.Item ?? [];
      const receiptNumber = String(items.find((i) => i.Name === 'MpesaReceiptNumber')?.Value ?? '');

      // Atomic single-claim idempotency: a duplicate callback matches
      // zero rows and is a no-op (spec §49).
      const claimed = await this.prisma.$transaction(async (tx) => {
        const result = await tx.subscriptionPayment.updateMany({
          where: { providerCheckoutId: CheckoutRequestID, status: 'PENDING' },
          data: {
            status: 'SUCCESSFUL',
            providerTransactionId: receiptNumber || undefined,
            paidAt: new Date(),
          },
        });
        if (result.count !== 1) return null;

        const subPayment = await tx.subscriptionPayment.findFirst({
          where: { providerCheckoutId: CheckoutRequestID },
        });
        if (!subPayment) return null;

        await tx.subscription.upsert({
          where: { organizationId: subPayment.organizationId },
          update: {
            status: 'ACTIVE',
            nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            planId: subPayment.planId,
            tier: subPayment.tier,
          },
          create: {
            organizationId: subPayment.organizationId,
            planId: subPayment.planId,
            tier: subPayment.tier,
            status: 'ACTIVE',
          },
        });
        await tx.organization.update({
          where: { id: subPayment.organizationId },
          data: { subscriptionStatus: 'ACTIVE', subscriptionPlan: subPayment.tier },
        });
        return subPayment;
      });

      if (claimed) {
        await this.notifyOwner(
          claimed.organizationId,
          'SUBSCRIPTION_PAYMENT_CONFIRMED',
          'Subscription confirmed',
          `Your Habita subscription is now active.`,
        );
      }
    } catch (err) {
      this.logger.error(`Subscription callback error: ${(err as Error).message}`);
    }

    return true;
  }

  private async notifyOwner(
    organizationId: string,
    type:
      'SUBSCRIPTION_PAYMENT_CONFIRMED' | 'SUBSCRIPTION_EXPIRING' | 'SUBSCRIPTION_PAYMENT_FAILED',
    title: string,
    body: string,
  ) {
    const owner = await this.prisma.organizationMember.findFirst({
      where: { organizationId, role: 'OWNER', isActive: true },
      include: { user: { select: { id: true, email: true, phone: true } } },
    });
    if (!owner) return;
    await this.notifications.dispatch({
      recipientUserId: owner.userId,
      organizationId,
      type,
      title,
      body: body.slice(0, 500),
      email: owner.user.email,
      phone: owner.user.phone ?? undefined,
    });
  }

  /** Cron helper: flag subscriptions due within 7 days for renewal notice. */
  async flagExpiringSubscriptions() {
    const soon = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const expiring = await this.prisma.subscription.findMany({
      where: { status: 'ACTIVE', nextBillingDate: { lte: soon, gte: new Date() } },
    });
    let notified = 0;
    for (const sub of expiring) {
      await this.notifyOwner(
        sub.organizationId,
        'SUBSCRIPTION_EXPIRING',
        'Subscription renewal due soon',
        `Your subscription renews on ${sub.nextBillingDate?.toISOString().slice(0, 10)}.`,
      );
      notified += 1;
    }
    return notified;
  }
}
