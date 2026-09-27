import prisma from '../../config/database';

const OTP_RESEND_SECONDS = 60;

export type PasswordResetChannel = 'email' | 'phone';

export type PasswordResetRow = {
  phone: string | null;
  email: string | null;
  token: string;
  created_at: Date | null;
};

function isTestOtpMode(): boolean {
  return process.env.APP_MODE === 'test' || process.env.NODE_ENV !== 'production';
}

export function generateResetOtp(): string {
  if (isTestOtpMode()) {
    return '123456';
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function findPasswordReset(
  channel: PasswordResetChannel,
  value: string
): Promise<PasswordResetRow | null> {
  const rows =
    channel === 'email'
      ? await prisma.$queryRaw<PasswordResetRow[]>`
          SELECT phone, email, token, created_at
          FROM password_resets
          WHERE email = ${value}
          LIMIT 1
        `
      : await prisma.$queryRaw<PasswordResetRow[]>`
          SELECT phone, email, token, created_at
          FROM password_resets
          WHERE phone = ${value}
          LIMIT 1
        `;
  return rows[0] ?? null;
}

export async function upsertPasswordReset(
  channel: PasswordResetChannel,
  value: string,
  token: string
): Promise<void> {
  if (channel === 'email') {
    await prisma.$executeRaw`DELETE FROM password_resets WHERE email = ${value}`;
    await prisma.$executeRaw`
      INSERT INTO password_resets (
        email, phone, token, created_at, otp_hit_count, is_blocked, is_temp_blocked, created_by
      )
      VALUES (${value}, NULL, ${token}, NOW(), 0, false, false, 'user')
    `;
    return;
  }

  await prisma.$executeRaw`DELETE FROM password_resets WHERE phone = ${value}`;
  await prisma.$executeRaw`
    INSERT INTO password_resets (
      phone, email, token, created_at, otp_hit_count, is_blocked, is_temp_blocked, created_by
    )
    VALUES (${value}, NULL, ${token}, NOW(), 0, false, false, 'user')
  `;
}

export async function deletePasswordReset(
  channel: PasswordResetChannel,
  value: string
): Promise<void> {
  if (channel === 'email') {
    await prisma.$executeRaw`DELETE FROM password_resets WHERE email = ${value}`;
    return;
  }
  await prisma.$executeRaw`DELETE FROM password_resets WHERE phone = ${value}`;
}

export function secondsUntilOtpResend(createdAt: Date | null): number {
  if (!createdAt) return 0;
  const elapsed = (Date.now() - createdAt.getTime()) / 1000;
  return elapsed >= OTP_RESEND_SECONDS ? 0 : Math.ceil(OTP_RESEND_SECONDS - elapsed);
}

export async function verifyResetToken(
  channel: PasswordResetChannel,
  value: string,
  resetToken: string
): Promise<boolean> {
  if (isTestOtpMode() && resetToken === '123456') {
    return true;
  }
  const row = await findPasswordReset(channel, value);
  return row?.token === resetToken;
}
