import { Module } from '@nestjs/common';
import { UnitTypesService } from './unit-types.service';
import { UnitTypesController } from './unit-types.controller';
import { UnitTypesReconcilerService } from './unit-types-reconciler.service';
import { OrganizationsModule } from '../organizations/organizations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [OrganizationsModule, NotificationsModule, StorageModule],
  controllers: [UnitTypesController],
  providers: [UnitTypesService, UnitTypesReconcilerService],
  exports: [UnitTypesService],
})
export class UnitTypesModule {}
