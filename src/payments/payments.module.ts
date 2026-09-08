import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MyPaymentsController } from './my-payments.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [OrganizationsModule, LedgerModule, ReceiptsModule, NotificationsModule],
  controllers: [PaymentsController, MyPaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
