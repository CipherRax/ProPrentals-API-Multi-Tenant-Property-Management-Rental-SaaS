import { Module } from '@nestjs/common';
import { TenantInvitationsService } from './tenant-invitations.service';
import { TenantInvitationsController } from './tenant-invitations.controller';
import { PublicTenantInvitationsController } from './public-tenant-invitations.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuthModule } from '../auth/auth.module';
import { TenanciesModule } from '../tenancies/tenancies.module';

@Module({
  imports: [OrganizationsModule, AuthModule, TenanciesModule],
  controllers: [TenantInvitationsController, PublicTenantInvitationsController],
  providers: [TenantInvitationsService],
  exports: [TenantInvitationsService],
})
export class TenantInvitationsModule {}
