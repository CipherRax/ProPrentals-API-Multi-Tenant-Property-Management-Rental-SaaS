import { BadRequestException } from '@nestjs/common';

// Normalizes common Kenyan phone number input formats to the MSISDN
// shape Daraja requires: 254 followed by 9 digits, no leading zero or
// plus sign. Accepts +2547XXXXXXXX, 2547XXXXXXXX, 07XXXXXXXX, 7XXXXXXXX,
// and the newer 01XXXXXXXX / 1XXXXXXXX ranges (Safaricom/Airtel/Telkom
// numbers that moved off the 07 prefix).
export function normalizeMsisdn(rawInput: string): string {
  const digitsOnly = rawInput.replace(/[^\d]/g, '');

  let normalized: string;
  if (digitsOnly.startsWith('254') && digitsOnly.length === 12) {
    normalized = digitsOnly;
  } else if (digitsOnly.startsWith('0') && digitsOnly.length === 10) {
    normalized = `254${digitsOnly.slice(1)}`;
  } else if (
    (digitsOnly.startsWith('7') || digitsOnly.startsWith('1')) &&
    digitsOnly.length === 9
  ) {
    normalized = `254${digitsOnly}`;
  } else {
    throw new BadRequestException(
      `"${rawInput}" is not a recognizable Kenyan phone number for M-Pesa`,
    );
  }

  if (!/^254[17]\d{8}$/.test(normalized)) {
    throw new BadRequestException(
      `"${rawInput}" does not resolve to a valid Safaricom/Airtel M-Pesa-capable number`,
    );
  }

  return normalized;
}
