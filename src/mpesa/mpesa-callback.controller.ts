import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { MpesaPaymentsService } from './mpesa-payments.service';
import { Public } from '../auth/decorators/public.decorator';
import { SkipResponseEnvelope } from '../common/decorators/skip-response-envelope.decorator';

// Safaricom calls this directly — no auth, no rate limiting beyond what
// the platform applies globally (a legitimate callback storm from
// Safaricom itself shouldn't be throttled the way login attempts are).
@ApiTags('mpesa')
@Public()
@Controller('mpesa')
export class MpesaCallbackController {
  constructor(private readonly mpesaPaymentsService: MpesaPaymentsService) {}

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
    return this.mpesaPaymentsService.handleCallback(payload as never);
  }
}
