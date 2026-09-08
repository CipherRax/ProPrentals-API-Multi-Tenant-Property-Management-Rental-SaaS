import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DepositsService } from './deposits.service';
import { RecordDepositPaymentDto } from './dto/record-deposit-payment.dto';
import { ProcessDepositDto } from './dto/process-deposit.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('deposits')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/tenancies/:tenancyId/deposit')
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Get()
  getForTenancy(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('tenancyId') tenancyId: string,
  ) {
    return this.depositsService.getForTenancy(userId, organizationId, tenancyId);
  }

  @Post('payments')
  recordPayment(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('tenancyId') tenancyId: string,
    @Body() dto: RecordDepositPaymentDto,
  ) {
    return this.depositsService.recordPayment(userId, organizationId, tenancyId, dto);
  }

  @Post('process')
  process(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('tenancyId') tenancyId: string,
    @Body() dto: ProcessDepositDto,
  ) {
    return this.depositsService.process(userId, organizationId, tenancyId, dto);
  }
}
