/**
 * Testing phase: return OTP in API JSON so apps can proceed without SMS/email.
 * Before go-live set OTP_IN_RESPONSE=false in production env.
 */
export function exposeOtpInApiResponse(): boolean {
  return process.env.OTP_IN_RESPONSE !== 'false';
}

export function otpTestingFields(otp: string): { otp: string } | Record<string, never> {
  if (!exposeOtpInApiResponse()) return {};
  return { otp };
}

/** When exposing OTP in response, delivery failure should not block the client. */
export function treatOtpDeliveryAsSuccess(sent: boolean): boolean {
  return sent || exposeOtpInApiResponse();
}
