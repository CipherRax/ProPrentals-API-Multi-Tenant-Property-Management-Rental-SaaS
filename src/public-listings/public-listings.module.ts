import { Module } from '@nestjs/common';
import { PublicListingsService } from './public-listings.service';
import { PublicListingsController } from './public-listings.controller';
import { NlSearchService } from './nl-search.service';
import { UnitTypesModule } from '../unit-types/unit-types.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [UnitTypesModule, AiModule],
  controllers: [PublicListingsController],
  providers: [PublicListingsService, NlSearchService],
  exports: [PublicListingsService],
})
export class PublicListingsModule {}
