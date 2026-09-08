import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { DepositsService } from './deposits.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('deposits')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('tenants/me/tenancies/:tenancyId/deposit')
export class MyDepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Get()
  getMine(@CurrentUser('userId') userId: string, @Param('tenancyId') tenancyId: string) {
    return this.depositsService.getMyDeposit(userId, tenancyId);
  }
}
