export interface SendResult {
  success: boolean;
  providerMessageId?: string;
  errorMessage?: string;
}

export interface EmailProvider {
  send(to: string, subject: string, body: string): Promise<SendResult>;
}

export interface SmsProvider {
  send(to: string, message: string): Promise<SendResult>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
export const SMS_PROVIDER = Symbol('SMS_PROVIDER');
