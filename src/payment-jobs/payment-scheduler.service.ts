import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PAYMENT_JOB_NAMES, PAYMENT_QUEUE } from './payment-jobs.constants';

@Injectable()
export class PaymentSchedulerService {
  private readonly logger = new Logger(PaymentSchedulerService.name);

  constructor(@InjectQueue(PAYMENT_QUEUE) private readonly paymentQueue: Queue) {}

  // Every 5 minutes — frequent enough that a stuck payment gets resolved
  // quickly, infrequent enough not to hammer Daraja's query endpoint.
  @Cron('*/5 * * * *')
  async scheduleReconciliation() {
    await this.paymentQueue.add(
      PAYMENT_JOB_NAMES.RECONCILE_MPESA,
      {},
      { removeOnComplete: true, removeOnFail: 20 },
    );
    this.logger.debug('Enqueued M-Pesa reconciliation sweep');
  }
}
