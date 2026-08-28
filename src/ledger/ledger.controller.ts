import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LedgerService } from './ledger.service';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { QueryLedgerDto } from './dto/query-ledger.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('ledger')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/tenancies/:tenancyId/ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get('entries')
  listEntries(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('tenancyId') tenancyId: string,
  ) {
    return this.ledgerService.listEntries(userId, organizationId, tenancyId);
  }

  @Get('statement')
  getStatement(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('tenancyId') tenancyId: string,
    @Query() query: QueryLedgerDto,
  ) {
    return this.ledgerService.getStatement(userId, organizationId, tenancyId, query);
  }

  @Post('adjustments')
  createAdjustment(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('tenancyId') tenancyId: string,
    @Body() dto: CreateAdjustmentDto,
  ) {
    return this.ledgerService.createAdjustment(userId, organizationId, tenancyId, dto);
  }

  @Post('entries/:entryId/reverse')
  reverseEntry(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('entryId') entryId: string,
  ) {
    return this.ledgerService.reverseEntry(userId, organizationId, entryId);
  }
}
