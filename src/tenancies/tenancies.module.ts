import { Module } from '@nestjs/common';
import { TenanciesService } from './tenancies.service';
import { TenanciesController } from './tenancies.controller';
import { MyTenanciesController } from './my-tenancies.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { UnitTypesModule } from '../unit-types/unit-types.module';

@Module({
  imports: [OrganizationsModule, LedgerModule, NotificationsModule, UnitTypesModule],
  controllers: [TenanciesController, MyTenanciesController],
  providers: [TenanciesService],
  exports: [TenanciesService],
})
export class TenanciesModule {}
