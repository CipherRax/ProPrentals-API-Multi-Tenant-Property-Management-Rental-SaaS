import { Module } from '@nestjs/common';
import { DepositsService } from './deposits.service';
import { DepositsController } from './deposits.controller';
import { MyDepositsController } from './my-deposits.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [OrganizationsModule, NotificationsModule],
  controllers: [DepositsController, MyDepositsController],
  providers: [DepositsService],
  exports: [DepositsService],
})
export class DepositsModule {}
