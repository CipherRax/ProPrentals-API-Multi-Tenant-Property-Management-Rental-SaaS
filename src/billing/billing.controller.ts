import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SubscriptionPlanTier } from '@prisma/client';
import { BillingService } from './billing.service';
import { OrgRoles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

class RecordSubscriptionPaymentDto {
  @IsEnum(SubscriptionPlanTier)
  tier: SubscriptionPlanTier;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  manualReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  paidAt?: string;
}

class InitiateSubscriptionStkPushDto {
  @IsEnum(SubscriptionPlanTier)
  tier: SubscriptionPlanTier;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  phoneNumber: string;
}

@ApiTags('Billing (subscriptions)')
@ApiBearerAuth()
@Controller('subscriptions')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Post('organizations/:organizationId/payments/manual')
  @OrgRoles('OWNER', 'PROPERTY_MANAGER', 'ACCOUNTANT')
  @ApiOperation({ summary: 'Record a manual subscription payment (bank transfer/cash)' })
  recordManual(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: RecordSubscriptionPaymentDto,
  ) {
    return this.billing.recordManualSubscriptionPayment(userId, organizationId, dto);
  }

  @Post('organizations/:organizationId/payments/mpesa/stk-push')
  @OrgRoles('OWNER')
  @ApiOperation({ summary: 'Pay the subscription via M-Pesa STK Push (owner only)' })
  initiateStk(
    @CurrentUser('userId') userId: string,
    @Param('organizationId', ParseUUIDPipe) organizationId: string,
    @Body() dto: InitiateSubscriptionStkPushDto,
  ) {
    return this.billing.initiateSubscriptionStkPush(userId, organizationId, dto);
  }
}

export { RecordSubscriptionPaymentDto, InitiateSubscriptionStkPushDto };
