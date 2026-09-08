import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsProvider, SendResult } from './provider.interfaces';
import { normalizeMsisdn } from '../../common/utils/msisdn.util';

interface AfricasTalkingRecipient {
  statusCode: number;
  number: string;
  status: string;
  cost: string;
  messageId: string;
}

interface AfricasTalkingResponse {
  SMSMessageData: {
    Message: string;
    Recipients: AfricasTalkingRecipient[];
  };
}

// Real HTTP calls to Africa's Talking's SMS API — the conventional
// default SMS provider for the Kenyan market. Swappable behind
// SmsProvider for Twilio/Infobip/etc. later without touching any
// calling code.
@Injectable()
export class AfricasTalkingSmsProvider implements SmsProvider {
  private readonly logger = new Logger(AfricasTalkingSmsProvider.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    // Africa's Talking uses a distinct sandbox subdomain, keyed off the
    // literal string "sandbox" as the configured username, same
    // convention as their own SDKs.
    const username = this.config.get<string>('sms.africastalking.username');
    return username === 'sandbox'
      ? 'https://api.sandbox.africastalking.com/version1/messaging'
      : 'https://api.africastalking.com/version1/messaging';
  }

  async send(to: string, message: string): Promise<SendResult> {
    const username = this.config.get<string>('sms.africastalking.username');
    const apiKey = this.config.get<string>('sms.africastalking.apiKey');

    if (!username || !apiKey) {
      return {
        success: false,
        errorMessage:
          "Africa's Talking is not configured (missing AFRICASTALKING_USERNAME/API_KEY)",
      };
    }

    let normalizedTo: string;
    try {
      normalizedTo = `+${normalizeMsisdn(to)}`;
    } catch (err) {
      return { success: false, errorMessage: (err as Error).message };
    }

    const senderId = this.config.get<string>('sms.africastalking.senderId');
    const body = new URLSearchParams({
      username,
      to: normalizedTo,
      message,
      ...(senderId ? { from: senderId } : {}),
    });

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          apiKey,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: body.toString(),
      });

      const data = (await response.json()) as AfricasTalkingResponse;
      const recipient = data.SMSMessageData?.Recipients?.[0];

      if (!response.ok || !recipient || recipient.statusCode !== 101) {
        const errorMessage = recipient?.status || data.SMSMessageData?.Message || 'SMS send failed';
        this.logger.error(`Africa's Talking SMS to ${normalizedTo} failed: ${errorMessage}`);
        return { success: false, errorMessage };
      }

      return { success: true, providerMessageId: recipient.messageId };
    } catch (err) {
      this.logger.error(`Africa's Talking request failed: ${(err as Error).message}`);
      return { success: false, errorMessage: (err as Error).message };
    }
  }
}
