import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MpesaPaymentsService } from '../mpesa/mpesa-payments.service';
import { PAYMENT_JOB_NAMES, PAYMENT_QUEUE } from './payment-jobs.constants';

@Processor(PAYMENT_QUEUE)
export class PaymentProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(private readonly mpesaPaymentsService: MpesaPaymentsService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case PAYMENT_JOB_NAMES.RECONCILE_MPESA:
        return this.mpesaPaymentsService.reconcileStalePendingPayments();
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        return null;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.name} (${job.id}) failed: ${error.message}`, error.stack);
  }
}
