import { Module } from '@nestjs/common';
import { StaffService } from './staff.service';
import { StaffController } from './staff.controller';
import { PublicStaffInvitationsController } from './public-staff-invitations.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [OrganizationsModule, AuthModule, NotificationsModule],
  controllers: [StaffController, PublicStaffInvitationsController],
  providers: [StaffService],
  exports: [StaffService],
})
export class StaffModule {}
