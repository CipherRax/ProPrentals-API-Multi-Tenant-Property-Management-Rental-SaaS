import { Module } from '@nestjs/common';
import { TenantInvitationsService } from './tenant-invitations.service';
import { TenantInvitationsController } from './tenant-invitations.controller';
import { PublicTenantInvitationsController } from './public-tenant-invitations.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AuthModule } from '../auth/auth.module';
import { TenanciesModule } from '../tenancies/tenancies.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UnitTypesModule } from '../unit-types/unit-types.module';

@Module({
  imports: [
    OrganizationsModule,
    SubscriptionsModule,
    AuthModule,
    TenanciesModule,
    NotificationsModule,
    UnitTypesModule,
  ],
  controllers: [TenantInvitationsController, PublicTenantInvitationsController],
  providers: [TenantInvitationsService],
  exports: [TenantInvitationsService],
})
export class TenantInvitationsModule {}
