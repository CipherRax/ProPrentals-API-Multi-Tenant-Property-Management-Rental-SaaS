import { Module, forwardRef } from '@nestjs/common';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { MpesaModule } from '../mpesa/mpesa.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    OrganizationsModule,
    SubscriptionsModule,
    forwardRef(() => MpesaModule),
    NotificationsModule,
  ],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
