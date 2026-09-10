import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { MyTenantProfileController } from './my-tenant-profile.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [OrganizationsModule, StorageModule],
  controllers: [TenantsController, MyTenantProfileController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
