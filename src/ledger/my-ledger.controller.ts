import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LedgerService } from './ledger.service';
import { QueryLedgerDto } from './dto/query-ledger.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('ledger')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('tenants/me/tenancies/:tenancyId/ledger')
export class MyLedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get('statement')
  getMyStatement(
    @CurrentUser('userId') userId: string,
    @Param('tenancyId') tenancyId: string,
    @Query() query: QueryLedgerDto,
  ) {
    return this.ledgerService.getMyStatement(userId, tenancyId, query);
  }
}
