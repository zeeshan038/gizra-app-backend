import prisma from '../../config/database';
import { secondsUntilOtpResend, type PasswordResetRow } from '../consumer/passwordResetDb';

export type LoginOtpPurpose = 'login_deliveryman' | 'login_vendor' | 'login_consumer';

function isTestOtpMode(): boolean {
  return process.env.APP_MODE === 'test' || process.env.NODE_ENV !== 'production';
}

export async function findLoginOtp(
  phone: string,
  purpose: LoginOtpPurpose
): Promise<PasswordResetRow | null> {
  const rows = await prisma.$queryRaw<PasswordResetRow[]>`
    SELECT phone, email, token, created_at
    FROM password_resets
    WHERE phone = ${phone} AND created_by = ${purpose}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function upsertLoginOtp(
  phone: string,
  purpose: LoginOtpPurpose,
  token: string
): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM password_resets WHERE phone = ${phone} AND created_by = ${purpose}
  `;
  await prisma.$executeRaw`
    INSERT INTO password_resets (
      phone, email, token, created_at, otp_hit_count, is_blocked, is_temp_blocked, created_by
    )
    VALUES (${phone}, NULL, ${token}, NOW(), 0, false, false, ${purpose})
  `;
}

export async function deleteLoginOtp(phone: string, purpose: LoginOtpPurpose): Promise<void> {
  await prisma.$executeRaw`
    DELETE FROM password_resets WHERE phone = ${phone} AND created_by = ${purpose}
  `;
}

export async function verifyLoginOtpToken(
  phone: string,
  purpose: LoginOtpPurpose,
  otp: string
): Promise<boolean> {
  if (isTestOtpMode() && (otp === '123456' || otp === '1234')) {
    return true;
  }
  const row = await findLoginOtp(phone, purpose);
  return row?.token === otp;
}

export { secondsUntilOtpResend };
