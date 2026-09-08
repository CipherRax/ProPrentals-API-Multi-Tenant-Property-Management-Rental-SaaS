import { Module, forwardRef } from '@nestjs/common';
import { MpesaClientService } from './mpesa-client.service';
import { MpesaPaymentsService } from './mpesa-payments.service';
import { MpesaController } from './mpesa.controller';
import { MpesaCallbackController } from './mpesa-callback.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { LedgerModule } from '../ledger/ledger.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReceiptsModule } from '../receipts/receipts.module';
import { BillingModule } from '../billing/billing.module';

@Module({
  imports: [
    OrganizationsModule,
    LedgerModule,
    PaymentsModule,
    ReceiptsModule,
    forwardRef(() => BillingModule),
  ],
  controllers: [MpesaController, MpesaCallbackController],
  providers: [MpesaClientService, MpesaPaymentsService],
  exports: [MpesaPaymentsService, MpesaClientService],
})
export class MpesaModule {}
