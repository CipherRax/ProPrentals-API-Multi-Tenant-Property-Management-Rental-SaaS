import { Module } from '@nestjs/common';
import { RentConfigurationsService } from './rent-configurations.service';
import { RentConfigurationsController } from './rent-configurations.controller';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [OrganizationsModule],
  controllers: [RentConfigurationsController],
  providers: [RentConfigurationsService],
  exports: [RentConfigurationsService],
})
export class RentConfigurationsModule {}
