import { Module } from '@nestjs/common';
import { PublicListingsService } from './public-listings.service';
import { PublicListingsController } from './public-listings.controller';

@Module({
  controllers: [PublicListingsController],
  providers: [PublicListingsService],
  exports: [PublicListingsService],
})
export class PublicListingsModule {}
