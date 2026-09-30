/** 4-digit OTP for driver app (Figma OTP screen). */
export function generateDmResetOtp(): string {
  if (process.env.APP_MODE === 'test' || process.env.NODE_ENV !== 'production') {
    return '1234';
  }
  return String(Math.floor(1000 + Math.random() * 9000));
}

export function maskPhoneForClient(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.length <= 4) return '****';
  return `${trimmed.slice(0, Math.min(3, trimmed.length))}${'*'.repeat(Math.max(4, trimmed.length - 6))}${trimmed.slice(-4)}`;
}
