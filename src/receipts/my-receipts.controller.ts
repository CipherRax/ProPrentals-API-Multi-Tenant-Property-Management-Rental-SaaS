import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { ReceiptsService } from './receipts.service';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SkipResponseEnvelope } from '../common/decorators/skip-response-envelope.decorator';

@ApiTags('receipts')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('tenants/me/receipts')
export class MyReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get()
  getMine(@CurrentUser('userId') userId: string) {
    return this.receiptsService.getMyReceipts(userId);
  }

  @SkipResponseEnvelope()
  @Get(':receiptId/pdf')
  async downloadMyPdf(
    @CurrentUser('userId') userId: string,
    @Param('receiptId') receiptId: string,
    @Res() res: Response,
  ) {
    const pdf = await this.receiptsService.getMyReceiptPdf(userId, receiptId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="receipt-${receiptId}.pdf"`);
    res.send(pdf);
  }
}
