import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MpesaPaymentsService } from './mpesa-payments.service';
import { BillingService } from '../billing/billing.service';
import { Public } from '../auth/decorators/public.decorator';
import { SkipResponseEnvelope } from '../common/decorators/skip-response-envelope.decorator';

// Safaricom calls this directly — no auth, no rate limiting beyond what
// the platform applies globally (a legitimate callback storm from
// Safaricom itself shouldn't be throttled the way login attempts are).
@ApiTags('mpesa')
@Public()
@Controller('mpesa')
export class MpesaCallbackController {
  constructor(
    private readonly mpesaPaymentsService: MpesaPaymentsService,
    private readonly billingService: BillingService,
  ) {}

  @SkipResponseEnvelope()
  @HttpCode(HttpStatus.OK)
  @Post('callback')
  async callback(@Body() payload: unknown) {
    // Always resolve 200/ResultCode 0 regardless of internal outcome —
    // returning an error here just makes Safaricom retry the same
    // callback repeatedly. Failures are logged internally instead.
    // @SkipResponseEnvelope() ensures Safaricom sees the exact
    // { ResultCode, ResultDesc } shape it expects, not our
    // {success, data} wrapper.
    //
    // One callback URL serves both financial domains: if the checkout
    // belongs to a SubscriptionPayment (platform billing, spec §36) the
    // BillingService handles it; otherwise it's a tenant rent payment.
    const handledByBilling = await this.billingService.handleCallback(payload as never);
    if (handledByBilling) {
      return { ResultCode: 0, ResultDesc: 'Success' };
    }
    return this.mpesaPaymentsService.handleCallback(payload as never);
  }
}
