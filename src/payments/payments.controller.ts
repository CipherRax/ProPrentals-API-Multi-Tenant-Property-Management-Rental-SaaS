import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { RecordManualPaymentDto } from './dto/record-manual-payment.dto';
import { QueryPaymentsDto } from './dto/query-payments.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('tenancies/:tenancyId/payments/manual')
  recordManual(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('tenancyId') tenancyId: string,
    @Body() dto: RecordManualPaymentDto,
  ) {
    return this.paymentsService.recordManualPayment(userId, organizationId, tenancyId, dto);
  }

  @Get('payments')
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Query() query: QueryPaymentsDto,
  ) {
    return this.paymentsService.findAll(userId, organizationId, query);
  }

  @Get('payments/:paymentId')
  findOne(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('paymentId') paymentId: string,
  ) {
    return this.paymentsService.findOne(userId, organizationId, paymentId);
  }
}
