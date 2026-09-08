import { Module } from '@nestjs/common';
import { RentChargesService } from './rent-charges.service';
import { RentChargesController } from './rent-charges.controller';
import { MyRentChargesController } from './my-rent-charges.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [OrganizationsModule, LedgerModule, NotificationsModule],
  controllers: [RentChargesController, MyRentChargesController],
  providers: [RentChargesService],
  exports: [RentChargesService],
})
export class RentChargesModule {}
