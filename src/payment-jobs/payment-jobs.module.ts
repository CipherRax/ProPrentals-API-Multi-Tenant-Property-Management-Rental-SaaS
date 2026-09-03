import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { PaymentSchedulerService } from './payment-scheduler.service';
import { PaymentProcessor } from './payment.processor';
import { MpesaModule } from '../mpesa/mpesa.module';
import { PAYMENT_QUEUE } from './payment-jobs.constants';

@Module({
  imports: [BullModule.registerQueue({ name: PAYMENT_QUEUE }), MpesaModule],
  providers: [PaymentSchedulerService, PaymentProcessor],
})
export class PaymentJobsModule {}
