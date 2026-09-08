import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { ChangePlanDto } from './dto/change-plan.dto';
import { OrgRoles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Subscriptions')
@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Get('subscriptions/plans')
  @Public()
  @ApiOperation({ summary: 'Public subscription plan catalog' })
  plans() {
    return this.subscriptions.listPlans();
  }

  @Get('organizations/:organizationId/subscription')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT', 'CARETAKER', 'STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Current subscription for an organization (with recent payments)' })
  getMy(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.subscriptions.getMySubscription(userId, organizationId);
  }

  @Post('organizations/:organizationId/subscription/change-plan')
  @OrgRoles('OWNER')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change the organization subscription plan (owner only)' })
  changePlan(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: ChangePlanDto,
  ) {
    return this.subscriptions.changePlan(userId, organizationId, dto);
  }

  @Get('organizations/:organizationId/subscription/limits')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT', 'CARETAKER', 'STAFF')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Effective feature limits for the organization's current plan" })
  limits(
    @CurrentUser('userId') _userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
  ) {
    return this.subscriptions.getEffectiveLimits(organizationId);
  }
}
