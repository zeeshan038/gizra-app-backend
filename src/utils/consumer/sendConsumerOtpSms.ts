/**
 * Sends OTP SMS for consumer flows (forgot password, etc.).
 * Wire to your SMS gateway (StackFood SMS_module / SmsGateway) when ready.
 */
export async function sendConsumerOtpSms(phone: string, otp: string): Promise<boolean> {
  if (process.env.APP_MODE === 'test' || process.env.NODE_ENV !== 'production') {
    console.info(`[sms] OTP for ${phone}: ${otp}`);
    return true;
  }

  // TODO: integrate business SMS provider
  console.warn('[sms] Consumer OTP SMS not configured; set up gateway in sendConsumerOtpSms');
  return false;
}
