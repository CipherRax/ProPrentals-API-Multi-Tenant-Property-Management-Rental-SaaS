import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { LedgerService } from './ledger.service';
import { QueryLedgerDto } from './dto/query-ledger.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipResponseEnvelope } from '../common/decorators/skip-response-envelope.decorator';

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

  @SkipResponseEnvelope()
  @Get('statement/pdf')
  async getMyStatementPdf(
    @CurrentUser('userId') userId: string,
    @Param('tenancyId') tenancyId: string,
    @Query() query: QueryLedgerDto,
    @Res() res: Response,
  ) {
    const pdf = await this.ledgerService.getMyStatementPdf(userId, tenancyId, query);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="statement-${tenancyId}.pdf"`);
    res.send(pdf);
  }
}
