import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RENT_JOB_NAMES, RENT_QUEUE } from './rent-jobs.constants';

// Cron only decides WHEN to run (spec §48); the actual work happens in
// RentProcessor via BullMQ (spec §47), which gives us retries, failure
// logging, and the ability to scale workers independently of the API
// process later. jobId is date-based so BullMQ itself also refuses to
// queue the same day's run twice while it's still pending/active — a
// second layer of idempotency on top of the DB unique constraint.
@Injectable()
export class RentSchedulerService {
  private readonly logger = new Logger(RentSchedulerService.name);

  constructor(@InjectQueue(RENT_QUEUE) private readonly rentQueue: Queue) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM, { timeZone: 'Africa/Nairobi' })
  async scheduleGenerateCharges() {
    const today = new Date().toISOString().slice(0, 10);
    await this.rentQueue.add(
      RENT_JOB_NAMES.GENERATE_CHARGES,
      {},
      { jobId: `${RENT_JOB_NAMES.GENERATE_CHARGES}-${today}`, removeOnComplete: true, removeOnFail: 50 },
    );
    this.logger.log('Enqueued daily rent charge generation job');
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { timeZone: 'Africa/Nairobi' })
  async scheduleDetectOverdue() {
    const today = new Date().toISOString().slice(0, 10);
    await this.rentQueue.add(
      RENT_JOB_NAMES.DETECT_OVERDUE,
      {},
      { jobId: `${RENT_JOB_NAMES.DETECT_OVERDUE}-${today}`, removeOnComplete: true, removeOnFail: 50 },
    );
    this.logger.log('Enqueued daily overdue-rent detection job');
  }
}
