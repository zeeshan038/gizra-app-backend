import { sendSmtpMail } from '../mail/smtpMail';

/**
 * Sends password-reset OTP email for consumer / vendor / driver flows.
 * Uses admin Business Settings → Mail (`mail_config` in DB) or SMTP_* env vars.
 */
export async function sendConsumerOtpEmail(email: string, otp: string): Promise<boolean> {
  if (process.env.APP_MODE === 'test') {
    console.info(`[email] Password reset OTP for ${email}: ${otp}`);
    return true;
  }

  if (process.env.NODE_ENV !== 'production' && process.env.OTP_EMAIL_SEND !== 'true') {
    console.info(`[email] Password reset OTP for ${email}: ${otp}`);
    return true;
  }

  const appName = process.env.APP_NAME?.trim() || 'Gizra';
  const subject = `${appName} — password reset code`;
  const text = [
    `Your password reset code is: ${otp}`,
    '',
    'This code expires shortly. If you did not request a reset, ignore this email.',
  ].join('\n');

  const sent = await sendSmtpMail({
    to: email.trim(),
    subject,
    text,
  });

  if (!sent) {
    console.warn('[email] Consumer OTP email failed — check mail_config in business_settings or SMTP_* env');
  }

  return sent;
}

export function maskEmailForClient(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '***';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at);
  if (local.length <= 2) {
    return `${local[0] ?? '*'}***${domain}`;
  }
  return `${local.slice(0, 2)}***${domain}`;
}
