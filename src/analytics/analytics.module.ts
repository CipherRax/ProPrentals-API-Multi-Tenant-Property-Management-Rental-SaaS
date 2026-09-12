import { Module } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AnalyticsInsightsService } from './insights.service';
import { AnalyticsController } from './analytics.controller';
import { OrganizationsModule } from '../organizations/organizations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [OrganizationsModule, SubscriptionsModule, AiModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsInsightsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
