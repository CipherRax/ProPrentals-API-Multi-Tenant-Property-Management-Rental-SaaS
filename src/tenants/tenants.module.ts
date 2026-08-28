import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { MyTenantProfileController } from './my-tenant-profile.controller';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [OrganizationsModule],
  controllers: [TenantsController, MyTenantProfileController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
