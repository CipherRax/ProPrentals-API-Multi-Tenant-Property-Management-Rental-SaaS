import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('tenants/me/payments')
export class MyPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  getMine(@CurrentUser('userId') userId: string) {
    return this.paymentsService.getMyPayments(userId);
  }
}
