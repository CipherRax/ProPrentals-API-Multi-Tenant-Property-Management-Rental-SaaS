import { Injectable, InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface DarajaOAuthResponse {
  access_token: string;
  expires_in: string;
}

export interface StkPushParams {
  phoneNumber: string; // already-normalized MSISDN, e.g. 2547XXXXXXXX
  amount: number;
  accountReference: string;
  transactionDesc: string;
}

export interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

export interface StkQueryResponse {
  ResponseCode: string;
  ResponseDescription: string;
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: string;
  ResultDesc: string;
}

/**
 * Thin wrapper over the real Safaricom Daraja API — OAuth token
 * acquisition, STK Push (Lipa Na M-Pesa Online), and STK status query.
 * This makes actual HTTP calls; there is no mocked/fake response path.
 * It cannot be exercised end-to-end without real MPESA_* credentials
 * (see .env.example) and, for the callback half of the flow, a publicly
 * reachable MPESA_CALLBACK_URL — neither of which this environment has.
 */
@Injectable()
export class MpesaClientService {
  private readonly logger = new Logger(MpesaClientService.name);
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('mpesa.env') === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
  }

  private assertConfigured() {
    const required = ['consumerKey', 'consumerSecret', 'shortcode', 'passkey', 'callbackUrl'];
    const missing = required.filter((key) => !this.config.get<string>(`mpesa.${key}`));
    if (missing.length > 0) {
      throw new InternalServerErrorException(
        `M-Pesa is not configured — missing: ${missing.map((k) => `MPESA_${k.toUpperCase()}`).join(', ')}. ` +
          'Set these in .env before initiating STK Push payments.',
      );
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }

    this.assertConfigured();
    const consumerKey = this.config.get<string>('mpesa.consumerKey');
    const consumerSecret = this.config.get<string>('mpesa.consumerSecret');
    const basicAuth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: { Authorization: `Basic ${basicAuth}` },
      });
    } catch (err) {
      this.logger.error(`Daraja OAuth request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Could not reach M-Pesa (Daraja OAuth)');
    }

    if (!response.ok) {
      const body = await response.text();
      this.logger.error(`Daraja OAuth rejected: ${response.status} ${body}`);
      throw new ServiceUnavailableException('M-Pesa authentication failed');
    }

    const data = (await response.json()) as DarajaOAuthResponse;
    const expiresInMs = (parseInt(data.expires_in, 10) || 3600) * 1000;
    this.cachedToken = { value: data.access_token, expiresAt: Date.now() + expiresInMs - 60_000 };
    return this.cachedToken.value;
  }

  private buildPassword(shortcode: string, passkey: string, timestamp: string): string {
    return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  }

  private formatTimestamp(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return (
      `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
      `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    );
  }

  async stkPush(params: StkPushParams): Promise<StkPushResponse> {
    this.assertConfigured();
    const token = await this.getAccessToken();
    const shortcode = this.config.get<string>('mpesa.shortcode')!;
    const passkey = this.config.get<string>('mpesa.passkey')!;
    const timestamp = this.formatTimestamp(new Date());
    const password = this.buildPassword(shortcode, passkey, timestamp);

    const body = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(params.amount),
      PartyA: params.phoneNumber,
      PartyB: shortcode,
      PhoneNumber: params.phoneNumber,
      CallBackURL: this.config.get<string>('mpesa.callbackUrl'),
      AccountReference: params.accountReference.slice(0, 12),
      TransactionDesc: params.transactionDesc.slice(0, 13),
    };

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/mpesa/stkpush/v1/processrequest`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this.logger.error(`Daraja STK Push request failed: ${(err as Error).message}`);
      throw new ServiceUnavailableException('Could not reach M-Pesa (STK Push)');
    }

    const data = await response.json();
    if (!response.ok || data.ResponseCode !== '0') {
      this.logger.error(`Daraja STK Push rejected: ${response.status} ${JSON.stringify(data)}`);
      throw new ServiceUnavailableException(
        data.errorMessage || data.ResponseDescription || 'M-Pesa STK Push was rejected',
      );
    }

    return data as StkPushResponse;
  }

  /**
   * Polls Daraja for the status of a previously-initiated STK Push.
   * Used as a fallback reconciliation path for payments stuck in
   * PENDING (e.g. the callback never arrived) — spec §18's "retry
   * handling" / §47's "payment reconciliation".
   */
  async queryStkStatus(checkoutRequestId: string): Promise<StkQueryResponse> {
    this.assertConfigured();
    const token = await this.getAccessToken();
    const shortcode = this.config.get<string>('mpesa.shortcode')!;
    const passkey = this.config.get<string>('mpesa.passkey')!;
    const timestamp = this.formatTimestamp(new Date());
    const password = this.buildPassword(shortcode, passkey, timestamp);

    const response = await fetch(`${this.baseUrl}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
    });

    const data = await response.json();
    return data as StkQueryResponse;
  }
}
