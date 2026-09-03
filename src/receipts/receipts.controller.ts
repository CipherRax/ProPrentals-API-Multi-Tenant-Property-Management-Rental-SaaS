import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ReceiptsService } from './receipts.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipResponseEnvelope } from '../common/decorators/skip-response-envelope.decorator';

@ApiTags('receipts')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('organizations/:organizationId/receipts')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Query('tenancyId') tenancyId?: string,
  ) {
    return this.receiptsService.findAll(userId, organizationId, tenancyId);
  }

  @SkipResponseEnvelope()
  @Get(':receiptId/pdf')
  async downloadPdf(
    @CurrentUser('userId') userId: string,
    @Param('organizationId') organizationId: string,
    @Param('receiptId') receiptId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.receiptsService.getPdf(userId, organizationId, receiptId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${receiptId}.pdf"`);
    res.send(pdf);
  }
}
