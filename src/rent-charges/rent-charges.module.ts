import { Module } from '@nestjs/common';
import { RentChargesService } from './rent-charges.service';
import { RentChargesController } from './rent-charges.controller';
import { MyRentChargesController } from './my-rent-charges.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [OrganizationsModule, LedgerModule],
  controllers: [RentChargesController, MyRentChargesController],
  providers: [RentChargesService],
  exports: [RentChargesService],
})
export class RentChargesModule {}
