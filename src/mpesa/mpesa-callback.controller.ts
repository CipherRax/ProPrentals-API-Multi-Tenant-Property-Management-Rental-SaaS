import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { MpesaPaymentsService } from './mpesa-payments.service';
import { BillingService } from '../billing/billing.service';
import { Public } from '../auth/decorators/public.decorator';
import { SkipResponseEnvelope } from '../common/decorators/skip-response-envelope.decorator';

@ApiTags('mpesa')
@Public()
@Controller('mpesa')
export class MpesaCallbackController {
  constructor(
    private readonly mpesaPaymentsService: MpesaPaymentsService,
    private readonly billingService: BillingService,
    private readonly config: ConfigService,
  ) {}

  @SkipResponseEnvelope()
  @HttpCode(HttpStatus.OK)
  @Post('callback')
  async callback(@Body() payload: unknown, @Req() req: Request) {
    // Optional shared-secret hardening for deployments that can pin one:
    // when MPESA_CALLBACK_KEY is set, Daraja-inbound callbacks must carry
    // `x-mpesa-callback-key` matching it. Safaricom's sandbox/live
    // callbacks do NOT send this header, so leaving it unset is the
    // default that keeps the standard integration working — the real
    // integrity guarantee is the CheckoutRequestID→PENDING-payment match
    // done server-side inside MpesaPaymentsService/BillingService.
    const expectedKey = this.config.get<string>('mpesa.callbackKey');
    if (expectedKey) {
      const provided = req.headers['x-mpesa-callback-key'];
      if (!provided || provided !== expectedKey) {
        throw new UnauthorizedException('Invalid callback signature');
      }
    }

    const body = this.assertStkCallbackShape(payload);

    const handledByBilling = await this.billingService.handleCallback(
      body as Parameters<BillingService['handleCallback']>[0],
    );
    if (handledByBilling) {
      return { ResultCode: 0, ResultDesc: 'Success' };
    }
    return this.mpesaPaymentsService.handleCallback(body as never);
  }

  /**
   * Defensive shape validation for the Daraja STK callback body. If the
   * payload isn't structurally a valid callback, we respond 400 rather
   * than attempting to process it — an attacker guessing this URL gets a
   * clear rejection, and only well-formed callbacks flow onward to the
   * (idempotent, CheckoutRequestID-matched) processing logic.
   */
  private assertStkCallbackShape(payload: unknown): Record<string, unknown> {
    if (typeof payload !== 'object' || payload === null) {
      throw new BadRequestException('Malformed M-Pesa callback: JSON object expected');
    }
    const root = payload as { Body?: unknown };
    const body = (root.Body ?? null) as { stkCallback?: unknown } | null;
    const stkCallback = body?.stkCallback;
    if (typeof stkCallback !== 'object' || stkCallback === null) {
      throw new BadRequestException('Malformed M-Pesa callback: missing Body.stkCallback');
    }
    const cb = stkCallback as {
      CheckoutRequestID?: unknown;
      ResultCode?: unknown;
      MerchantRequestID?: unknown;
    };
    if (typeof cb.CheckoutRequestID !== 'string' || !cb.CheckoutRequestID) {
      throw new BadRequestException('Malformed M-Pesa callback: missing CheckoutRequestID');
    }
    if (typeof cb.ResultCode !== 'number') {
      throw new BadRequestException('Malformed M-Pesa callback: missing numeric ResultCode');
    }
    if (typeof cb.MerchantRequestID !== 'string') {
      throw new BadRequestException('Malformed M-Pesa callback: missing MerchantRequestID');
    }
    return payload as Record<string, unknown>;
  }
}