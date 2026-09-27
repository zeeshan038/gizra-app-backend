/**
 * Sends password-reset OTP email for consumer flows.
 * Wire to SMTP / SendGrid / etc. when ready.
 */
export async function sendConsumerOtpEmail(email: string, otp: string): Promise<boolean> {
  if (process.env.APP_MODE === 'test' || process.env.NODE_ENV !== 'production') {
    console.info(`[email] Password reset OTP for ${email}: ${otp}`);
    return true;
  }

  // TODO: integrate mail provider (same as legacy StackFood mail config)
  console.warn('[email] Consumer OTP email not configured; set up sendConsumerOtpEmail');
  return false;
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
