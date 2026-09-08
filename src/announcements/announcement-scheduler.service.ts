import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AnnouncementsService } from './announcements.service';

@Injectable()
export class AnnouncementScheduler {
  private readonly logger = new Logger(AnnouncementScheduler.name);

  constructor(private readonly announcements: AnnouncementsService) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { timeZone: 'Africa/Nairobi' })
  async publishDueScheduled() {
    try {
      const count = await this.announcements.publishDueScheduled();
      if (count) this.logger.log(`Published ${count} scheduled announcement(s)`);
    } catch (err) {
      this.logger.error(`Scheduled announcement publish failed: ${(err as Error).message}`);
    }
  }
}
