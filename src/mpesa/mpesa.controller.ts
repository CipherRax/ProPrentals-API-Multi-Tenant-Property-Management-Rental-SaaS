import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { MpesaPaymentsService } from './mpesa-payments.service';
import { InitiateStkPushDto } from '../payments/dto/initiate-stk-push.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('mpesa')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller()
export class MpesaController {
  constructor(private readonly mpesaPaymentsService: MpesaPaymentsService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('organizations/:organizationId/tenancies/:tenancyId/payments/mpesa/stk-push')
  initiateForOrganization(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('tenancyId') tenancyId: string,
    @Body() dto: InitiateStkPushDto,
  ) {
    return this.mpesaPaymentsService.initiateForOrganization(
      userId,
      organizationId,
      tenancyId,
      dto,
    );
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('tenants/me/tenancies/:tenancyId/payments/mpesa/stk-push')
  initiateForMe(
    @CurrentUser('userId') userId: string,
    @Param('tenancyId') tenancyId: string,
    @Body() dto: InitiateStkPushDto,
  ) {
    return this.mpesaPaymentsService.initiateForMe(userId, tenancyId, dto);
  }
}
