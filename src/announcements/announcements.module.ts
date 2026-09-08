import { Module } from '@nestjs/common';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementsController } from './announcements.controller';
import { MyAnnouncementsController } from './my-announcements.controller';
import { AnnouncementScheduler } from './announcement-scheduler.service';
import { OrganizationsModule } from '../organizations/organizations.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [OrganizationsModule, NotificationsModule],
  controllers: [AnnouncementsController, MyAnnouncementsController],
  providers: [AnnouncementsService, AnnouncementScheduler],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
