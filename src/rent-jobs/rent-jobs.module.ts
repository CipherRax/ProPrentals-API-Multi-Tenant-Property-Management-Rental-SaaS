import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RentSchedulerService } from './rent-scheduler.service';
import { RentProcessor } from './rent.processor';
import { RentChargesModule } from '../rent-charges/rent-charges.module';
import { RENT_QUEUE } from './rent-jobs.constants';

@Module({
  imports: [BullModule.registerQueue({ name: RENT_QUEUE }), RentChargesModule],
  providers: [RentSchedulerService, RentProcessor],
})
export class RentJobsModule {}
