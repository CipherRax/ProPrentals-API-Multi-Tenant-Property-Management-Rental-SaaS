import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RentChargesService } from '../rent-charges/rent-charges.service';
import { TenanciesService } from '../tenancies/tenancies.service';
import { RENT_JOB_NAMES, RENT_QUEUE } from './rent-jobs.constants';

// The actual worker. Runs in the same process as the API by default
// (fine for this scale); split into a standalone worker process later
// by pointing a second Nest application context at the same queue if
// rent-generation volume ever needs independent scaling.
@Processor(RENT_QUEUE)
export class RentProcessor extends WorkerHost {
  private readonly logger = new Logger(RentProcessor.name);

  constructor(
    private readonly rentChargesService: RentChargesService,
    private readonly tenanciesService: TenanciesService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing job ${job.name} (${job.id})`);

    switch (job.name) {
      case RENT_JOB_NAMES.ACTIVATE_TENANCIES:
        return this.tenanciesService.activateDueTenancies();
      case RENT_JOB_NAMES.GENERATE_CHARGES:
        return this.rentChargesService.generateChargesForAllActiveTenancies();
      case RENT_JOB_NAMES.DETECT_OVERDUE:
        return this.rentChargesService.detectOverdueCharges();
      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        return null;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: unknown) {
    this.logger.log(`Job ${job.name} (${job.id}) completed: ${JSON.stringify(result)}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.name} (${job.id}) failed: ${error.message}`, error.stack);
  }
}
