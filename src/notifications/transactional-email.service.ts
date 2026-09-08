import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  EMAIL_PROVIDER,
  SMS_PROVIDER,
  EmailProvider,
  SmsProvider,
} from './providers/provider.interfaces';

/**
 * Account-critical emails/SMS that must always attempt delivery
 * regardless of any notification preference, and that often target
 * someone who doesn't have a User account yet (a freshly-invited
 * tenant) — so there's no preference row to check in the first place.
 * Deliberately bypasses NotificationsService/NotificationPreference
 * entirely; opting out of your own password reset email would be a
 * foot-gun, not a feature.
 */
@Injectable()
export class TransactionalEmailService {
  private readonly logger = new Logger(TransactionalEmailService.name);

  constructor(
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    @Inject(SMS_PROVIDER) private readonly smsProvider: SmsProvider,
  ) {}

  async sendPasswordReset(email: string, resetLink: string): Promise<void> {
    const result = await this.emailProvider.send(
      email,
      'Reset your ProPrentals password',
      `We received a request to reset your password. Use the link below — it expires in 1 hour:\n\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email.`,
    );
    if (!result.success) {
      this.logger.error(`Password reset email to ${email} failed: ${result.errorMessage}`);
    }
  }

  async sendTenantInvitation(
    email: string,
    phone: string | null,
    tenantName: string,
    organizationName: string,
    invitationLink: string,
  ): Promise<void> {
    const emailResult = await this.emailProvider.send(
      email,
      `You're invited to join ${organizationName} on ProPrentals`,
      `Hi ${tenantName},\n\n${organizationName} has invited you to set up your tenant account. Use the link below to accept and activate your account:\n\n${invitationLink}\n\nThis link expires soon, so please use it promptly.`,
    );
    if (!emailResult.success) {
      this.logger.warn(`Invitation email to ${email} failed: ${emailResult.errorMessage}`);
    }

    if (phone) {
      const smsResult = await this.smsProvider.send(
        phone,
        `${organizationName} invited you to ProPrentals. Activate your tenant account: ${invitationLink}`,
      );
      if (!smsResult.success) {
        this.logger.warn(`Invitation SMS to ${phone} failed: ${smsResult.errorMessage}`);
      }
    }
  }
}
