import { Module } from '@nestjs/common';
import { PublicListingsService } from './public-listings.service';
import { PublicListingsController } from './public-listings.controller';
import { UnitTypesModule } from '../unit-types/unit-types.module';

@Module({
  imports: [UnitTypesModule],
  controllers: [PublicListingsController],
  providers: [PublicListingsService],
  exports: [PublicListingsService],
})
export class PublicListingsModule {}
