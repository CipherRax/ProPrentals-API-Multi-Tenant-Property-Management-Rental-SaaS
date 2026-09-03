import { SetMetadata } from '@nestjs/common';

export const SKIP_RESPONSE_ENVELOPE_KEY = 'skipResponseEnvelope';

// A handful of endpoints must return an exact, unwrapped JSON shape
// dictated by an external protocol rather than our own {success, data}
// envelope — the M-Pesa Daraja callback being the motivating case:
// Safaricom parses ResultCode/ResultDesc at the top level and will keep
// retrying the callback indefinitely if it doesn't see that shape.
export const SkipResponseEnvelope = () => SetMetadata(SKIP_RESPONSE_ENVELOPE_KEY, true);
