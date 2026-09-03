import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MyPaymentsController } from './my-payments.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ReceiptsModule } from '../receipts/receipts.module';

@Module({
  imports: [OrganizationsModule, LedgerModule, ReceiptsModule],
  controllers: [PaymentsController, MyPaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
