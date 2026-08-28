import { Module } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { LedgerController } from './ledger.controller';
import { MyLedgerController } from './my-ledger.controller';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [OrganizationsModule],
  controllers: [LedgerController, MyLedgerController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule {}
