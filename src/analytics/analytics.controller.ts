import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrgRoles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AnalyticsService } from './analytics.service';
import { AnalyticsInsightsService } from './insights.service';
import { GetAnalyticsQueryDto } from './dto/get-analytics-query.dto';

@ApiTags('Analytics & AI Insights')
@ApiBearerAuth()
@Controller('organizations/:organizationId/analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly insights: AnalyticsInsightsService,
  ) {}

  @Get()
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT')
  @ApiOperation({
    summary:
      'Analytics bundle (occupancy, payments, inquiries, comparative) with per-property / per-unit-type drill-down.',
  })
  @ApiQuery({ name: 'propertyId', required: false })
  @ApiQuery({ name: 'unitTypeId', required: false })
  getAnalytics(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query() query: GetAnalyticsQueryDto,
  ) {
    return this.analytics.getAnalytics(userId, organizationId, query);
  }

  @Get('insights')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT')
  @ApiOperation({
    summary:
      "AI plain-language digest: summary + critical issues + suggestions (cached ~daily; only the landlord's own data).",
  })
  @ApiQuery({ name: 'propertyId', required: false })
  @ApiQuery({ name: 'unitTypeId', required: false })
  getInsights(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Query() query: GetAnalyticsQueryDto,
  ) {
    return this.insights.getInsights(userId, organizationId, query);
  }

  @Post('insights/refresh')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Force-regenerate the cached portfolio AI digest.' })
  refreshInsights(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.insights.refresh(userId, organizationId);
  }

  @Patch('insights/suggestions/:suggestionId/dismiss')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Dismiss an AI suggestion so it no longer shows (persisted).' })
  dismissSuggestion(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Param('suggestionId') suggestionId: string,
  ) {
    return this.insights.dismissSuggestion(userId, organizationId, suggestionId);
  }
}
