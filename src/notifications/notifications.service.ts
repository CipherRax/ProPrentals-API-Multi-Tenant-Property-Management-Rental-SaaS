import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  EMAIL_PROVIDER,
  SMS_PROVIDER,
  EmailProvider,
  SmsProvider,
} from './providers/provider.interfaces';
import { NOTIFICATION_CATEGORY_MAP } from './notifications.constants';
import { buildPaginatedResult, paginationSkip } from '../common/utils/paginate';

interface DispatchParams {
  recipientUserId: string;
  organizationId?: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  email?: string; // resolved recipient email, if EMAIL should be attempted
  phone?: string; // resolved recipient phone, if SMS should be attempted
}

/**
 * The general-purpose notification pipeline for events tied to an
 * EXISTING user (rent due, payment confirmed, deposit processed, ...).
 * Deliberately separate from TransactionalEmailService, which handles
 * account-critical emails (password reset, invitation delivery) that
 * must always go out regardless of any preference toggle and don't
 * require an existing user to check preferences against.
 *
 * Never throws — a broken email/SMS provider must never break the
 * financial or business operation that triggered the notification.
 * Call this AFTER the triggering transaction has committed, not from
 * inside it, so a slow/flaky provider can't hold a DB transaction open.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  async dispatch(params: DispatchParams): Promise<void> {
    try {
      const notification = await this.prisma.notification.create({
        data: {
          recipientUserId: params.recipientUserId,
          organizationId: params.organizationId,
          type: params.type,
          title: params.title,
          body: params.body,
          data: (params.data as Prisma.InputJsonValue) ?? undefined,
        },
      });

      const category = NOTIFICATION_CATEGORY_MAP[params.type];
      const preference = category
        ? await this.prisma.notificationPreference.findUnique({
            where: { userId_category: { userId: params.recipientUserId, category } },
          })
        : null;

      // Missing preference row = default to everything enabled.
      const emailEnabled = preference?.emailEnabled ?? true;
      const smsEnabled = preference?.smsEnabled ?? true;

      if (params.email) {
        await this.attemptChannel(notification.id, 'EMAIL', emailEnabled, () =>
          this.emailProvider.send(params.email!, params.title, { text: params.body }),
        );
      }

      if (params.phone) {
        await this.attemptChannel(notification.id, 'SMS', smsEnabled, () =>
          this.smsProvider.send(params.phone!, params.body),
        );
      }
    } catch (err) {
      // Notification dispatch is best-effort by design — log and move
      // on rather than letting a notification failure surface as an
      // error to whatever business operation triggered it.
      this.logger.error(
        `Notification dispatch failed: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async attemptChannel(
    notificationId: string,
    channel: NotificationChannel,
    enabled: boolean,
    send: () => Promise<{ success: boolean; providerMessageId?: string; errorMessage?: string }>,
  ) {
    if (!enabled) {
      await this.prisma.notificationDeliveryLog.create({
        data: {
          notificationId,
          channel,
          status: 'SKIPPED',
          errorMessage: 'Disabled by user preference',
        },
      });
      return;
    }

    const result = await send();
    await this.prisma.notificationDeliveryLog.create({
      data: {
        notificationId,
        channel,
        status: result.success ? 'SENT' : 'FAILED',
        providerMessageId: result.providerMessageId,
        errorMessage: result.errorMessage,
      },
    });
  }

  // ── User-facing: in-app notification inbox ─────────────────────────

  async listForUser(userId: string, page = 1, limit = 20) {
    const where = { recipientUserId: userId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        skip: paginationSkip(page, limit),
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
    ]);

    return buildPaginatedResult(
      data.map((n) => ({
        id: n.id,
        type: n.type,
        category:
          NOTIFICATION_CATEGORY_MAP[n.type] ?? (n.type as unknown as NotificationCategory),
        title: n.title,
        message: n.body,
        read: n.readAt !== null,
        createdAt: n.createdAt,
      })),
      total,
      page,
      limit,
    );
  }

  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { recipientUserId: userId, readAt: null },
    });
    return { unreadCount: count };
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id: notificationId, recipientUserId: userId },
    });
    if (!notification) throw new NotFoundException('Notification not found');

    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { readAt: notification.readAt ?? new Date() },
    });
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { recipientUserId: userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { message: 'All notifications marked as read' };
  }

  // ── User-facing: preferences ─────────────────────────────────────────

  async getMyPreferences(userId: string) {
    const stored = await this.prisma.notificationPreference.findMany({ where: { userId } });
    const storedByCategory = new Map(stored.map((p) => [p.category, p]));

    const categories: NotificationCategory[] = [
      'RENT_REMINDERS',
      'PAYMENT_CONFIRMATIONS',
      'MESSAGES',
      'ANNOUNCEMENTS',
      'MAINTENANCE_UPDATES',
      'LEASE_REMINDERS',
    ];

    return categories.map((category) => {
      const existing = storedByCategory.get(category);
      return {
        category,
        inAppEnabled: existing?.inAppEnabled ?? true,
        emailEnabled: existing?.emailEnabled ?? true,
        smsEnabled: existing?.smsEnabled ?? true,
      };
    });
  }

  async updateMyPreference(
    userId: string,
    category: NotificationCategory,
    values: { inAppEnabled: boolean; emailEnabled: boolean; smsEnabled: boolean },
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId_category: { userId, category } },
      update: values,
      create: { userId, category, ...values },
    });
  }
}
