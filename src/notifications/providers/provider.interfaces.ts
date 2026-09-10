export interface SendResult {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

export interface EmailSendPayload {
  /** Plain-text fallback for clients that don't render HTML. */
  text: string;
  /** Optional rich HTML body (styled, but no external assets). */
  html?: string;
}

export interface EmailProvider {
  send(to: string, subject: string, payload: EmailSendPayload): Promise<SendResult>;
}

export interface SmsProvider {
  send(to: string, message: string): Promise<SendResult>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
