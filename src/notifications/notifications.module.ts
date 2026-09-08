import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { TransactionalEmailService } from './transactional-email.service';
import { SmtpEmailProvider } from './providers/smtp-email.provider';
import { AfricasTalkingSmsProvider } from './providers/africastalking-sms.provider';
import { EMAIL_PROVIDER, SMS_PROVIDER } from './providers/provider.interfaces';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    TransactionalEmailService,
    { provide: EMAIL_PROVIDER, useClass: SmtpEmailProvider },
    { provide: SMS_PROVIDER, useClass: AfricasTalkingSmsProvider },
  ],
  exports: [NotificationsService, TransactionalEmailService],
})
export class NotificationsModule {}
