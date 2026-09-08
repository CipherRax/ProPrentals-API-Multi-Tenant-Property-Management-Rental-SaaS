import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailProvider, SendResult } from './provider.interfaces';

// Real SMTP delivery via nodemailer. Swappable for SendGrid/Postmark/SES
// later without touching any calling code — everything upstream depends
// only on the EmailProvider interface (spec §27: "build a notification
// abstraction so providers can be changed later").
@Injectable()
export class SmtpEmailProvider implements EmailProvider {
  private readonly logger = new Logger(SmtpEmailProvider.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private getTransporter(): nodemailer.Transporter | null {
    if (this.transporter) return this.transporter;

    const host = this.config.get<string>('smtp.host');
    const user = this.config.get<string>('smtp.user');
    const password = this.config.get<string>('smtp.password');

    if (!host || !user || !password) {
      return null; // caller treats this as "not configured", not an error
    }

    this.transporter = nodemailer.createTransport({
      host,
      port: this.config.get<number>('smtp.port') || 587,
      secure: false,
      auth: { user, pass: password },
    });
    return this.transporter;
  }

  async send(to: string, subject: string, body: string): Promise<SendResult> {
    const transporter = this.getTransporter();
    if (!transporter) {
      return {
        success: false,
        errorMessage: 'SMTP is not configured (missing SMTP_HOST/USER/PASSWORD)',
      };
    }

    try {
      const info = await transporter.sendMail({
        from: this.config.get<string>('smtp.from'),
        to,
        subject,
        text: body,
      });
      return { success: true, providerMessageId: info.messageId };
    } catch (err) {
      this.logger.error(`Email send failed to ${to}: ${(err as Error).message}`);
      return { success: false, errorMessage: (err as Error).message };
    }
  }
}
