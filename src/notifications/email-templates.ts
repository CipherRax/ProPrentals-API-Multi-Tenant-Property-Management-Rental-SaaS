import { EmailSendPayload } from './providers/provider.interfaces';

/**
 * Branded HTML email templates for account-critical emails (invitations,
 * password resets). Rendered with inline styles only so they render
 * consistently across email clients (no external CSS/assets, email-safe).
 * Each template also carries a plain-text variant for non-HTML clients.
 */

const BRAND_DARK = '#275355';
const BRAND_DEEP = '#1c3638';
const BRAND_SOFT = '#eef6f5';

interface TemplateBase {
  recipientName: string;
  organizationName: string;
  actionUrl: string;
  actionLabel: string;
  note?: string;
}

function layout(bodyHtml: string, note?: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="x-apple-disable-message-reformatting" />
  </head>
  <body style="margin:0;padding:0;background-color:#f4f5f2;font-family:Segoe UI,Helvetica,Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e6e7e2;">
        <tr>
          <td style="background-color:${BRAND_DARK};padding:22px 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">ProPrentals</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            ${bodyHtml}
          </td>
        </tr>
        ${note ? `
        <tr>
          <td style="padding:0 32px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${BRAND_SOFT};border-radius:8px;">
              <tr>
                <td style="padding:14px 16px;font-size:12.5px;line-height:20px;color:${BRAND_DEEP};">${note}</td>
              </tr>
            </table>
          </td>
        </tr>` : ''}
        <tr>
          <td style="padding:18px 32px 24px;border-top:1px solid #ecece6;font-size:11.5px;line-height:18px;color:#8a8a80;">
            You are receiving this email because you were invited to use
            ProPrentals, a property management platform. If this wasn't expected,
            you can safely ignore this message.
          </td>
        </tr>
      </table>
      <p style="text-align:center;font-size:11px;color:#a5a59b;margin:16px 0 0;">
        © ${new Date().getFullYear()} ProPrentals · Secure property &amp; rental management
      </p>
    </div>
  </body>
</html>
  `.trim();
}

function ctaButton(label: string, url: string): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="border-radius:8px;background-color:${BRAND_DARK};">
          <a href="${url}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a>
        </td>
      </tr>
    </table>
    <p style="font-size:12.5px;line-height:20px;color:#6f6f66;word-break:break-all;">
      If the button doesn't work, copy and paste this link into your browser:<br />
      <a href="${url}" style="color:${BRAND_DARK};">${url}</a>
    </p>
  `.trim();
}

export interface TenantInvitationTemplate extends TemplateBase {
  expiresNote?: string;
}

export function tenantInvitation(p: TenantInvitationTemplate): EmailSendPayload {
  const bodyHtml = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#2c2b26;">You're invited to ${p.organizationName}</h2>
    <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#4d4c45;">
      Hi ${p.recipientName},
    </p>
    <p style="margin:0 0 6px;font-size:14px;line-height:22px;color:#4d4c45;">
      <strong>${p.organizationName}</strong> has set up a tenant account for you on
      ProPrentals. Click the button below to open your account and start using it.
    </p>
    ${ctaButton(p.actionLabel, p.actionUrl)}
  `;
  return {
    text: [
      `You're invited to join ${p.organizationName} on ProPrentals`,
      '',
      `Hi ${p.recipientName},`,
      '',
      `${p.organizationName} has set up a tenant account for you on ProPrentals.`,
      'Open the link below to access your account:',
      '',
      p.actionUrl,
      '',
      p.expiresNote ? p.expiresNote : 'This link is temporary, so please use it promptly.',
    ].join('\n'),
    html: layout(bodyHtml, p.expiresNote),
  };
}

export interface StaffInvitationTemplate extends TemplateBase {
  roleLabel: string;
  expiresNote?: string;
}

export function staffInvitation(p: StaffInvitationTemplate): EmailSendPayload {
  const bodyHtml = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#2c2b26;">You're invited to join ${p.organizationName}</h2>
    <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#4d4c45;">
      Hi ${p.recipientName},
    </p>
    <p style="margin:0 0 6px;font-size:14px;line-height:22px;color:#4d4c45;">
      <strong>${p.organizationName}</strong> has added you to their ProPrentals
      workspace as <strong>${p.roleLabel}</strong>. Accept the invitation below to
      set up your staff account.
    </p>
    ${ctaButton(p.actionLabel, p.actionUrl)}
  `;
  return {
    text: [
      `You're invited to join ${p.organizationName} on ProPrentals`,
      '',
      `Hi ${p.recipientName},`,
      '',
      `${p.organizationName} has added you to their ProPrentals workspace as ${p.roleLabel}.`,
      'Use the link below to accept the invitation and set up your staff account:',
      '',
      p.actionUrl,
      '',
      p.expiresNote ? p.expiresNote : 'This link is temporary, so please use it promptly.',
    ].join('\n'),
    html: layout(bodyHtml, p.expiresNote),
  };
}

export interface PasswordResetTemplate extends TemplateBase {}

export function passwordReset(p: PasswordResetTemplate): EmailSendPayload {
  const bodyHtml = `
    <h2 style="margin:0 0 8px;font-size:20px;color:#2c2b26;">Reset your password</h2>
    <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#4d4c45;">
      Hi ${p.recipientName},
    </p>
    <p style="margin:0 0 6px;font-size:14px;line-height:22px;color:#4d4c45;">
      We received a request to reset your ProPrentals password. Use the link below
      to choose a new one.
    </p>
    ${ctaButton(p.actionLabel, p.actionUrl)}
  `;
  return {
    text: [
      'Reset your ProPrentals password',
      '',
      `Hi ${p.recipientName},`,
      '',
      'We received a request to reset your ProPrentals password.',
      'Use the link below to choose a new one:',
      '',
      p.actionUrl,
      '',
      'If you didn\'t request this, you can safely ignore this email.',
    ].join('\n'),
    html: layout(bodyHtml, 'This link expires in 1 hour.'),
  };
}