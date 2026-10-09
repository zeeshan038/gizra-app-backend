import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import prisma from '../../config/database';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyPasswordOtpSchema,
} from '../../schemas/consumer/password';
import {
  deletePasswordReset,
  findPasswordReset,
  generateResetOtp,
  PasswordResetChannel,
  secondsUntilOtpResend,
  upsertPasswordReset,
  verifyResetToken,
} from '../../utils/consumer/passwordResetDb';
import { maskEmailForClient, sendConsumerOtpEmail } from '../../utils/consumer/sendConsumerOtpEmail';
import { sendConsumerOtpSms } from '../../utils/consumer/sendConsumerOtpSms';
import {
  exposeOtpInApiResponse,
  otpTestingFields,
  treatOtpDeliveryAsSuccess,
} from '../../utils/otp/otpTestingResponse';

type ResetIdentityBody = {
  field_type: 'email' | 'phone';
  email?: string;
  phone?: string;
};

function requireUserId(req: Request, res: Response): number | null {
  const userId = Number(req.user?.id);
  if (!userId) {
    res.status(401).json({ status: false, msg: 'Unauthorized' });
    return null;
  }
  return userId;
}

function parseResetIdentity(body: ResetIdentityBody): {
  channel: PasswordResetChannel;
  value: string;
} {
  if (body.field_type === 'phone') {
    return { channel: 'phone', value: String(body.phone).trim() };
  }
  return { channel: 'email', value: String(body.email).trim().toLowerCase() };
}

async function findUserByResetIdentity(channel: PasswordResetChannel, value: string) {
  if (channel === 'email') {
    return prisma.users.findFirst({
      where: { email: { equals: value, mode: 'insensitive' } },
    });
  }
  return prisma.users.findFirst({ where: { phone: value } });
}

/**
 * @Description Change password while logged in
 * @Route PUT /api/consumer/password/change
 * @Access Private
 */
export const changePassword = async (req: Request, res: Response): Promise<any> => {
  const userId = requireUserId(req, res);
  if (userId == null) return;

  const validated = changePasswordSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const { current_password, password } = validated.value as {
    current_password: string;
    password: string;
    confirm_password: string;
  };

  try {
    const user = await prisma.users.findUnique({ where: { id: BigInt(userId) } });
    if (!user?.password) {
      return res.status(400).json({ status: false, msg: 'Password login is not set for this account' });
    }

    const matches = await bcrypt.compare(current_password, user.password);
    if (!matches) {
      return res.status(403).json({ status: false, msg: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await prisma.users.update({
      where: { id: BigInt(userId) },
      data: { password: hashed, updated_at: new Date() },
    });

    return res.status(200).json({ status: true, msg: 'Password successfully updated' });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Request OTP for forgot password (email or phone)
 * @Route POST /api/consumer/password/forgot
 * @Access Public
 */
export const forgotPassword = async (req: Request, res: Response): Promise<any> => {
  const validated = forgotPasswordSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const body = validated.value as ResetIdentityBody;
  const { channel, value } = parseResetIdentity(body);

  try {
    const user = await findUserByResetIdentity(channel, value);
    if (!user) {
      const msg =
        channel === 'email' ? 'Email address not found!' : 'Phone number not found!';
      return res.status(404).json({ status: false, msg });
    }

    if (channel === 'email' && !user.email) {
      return res.status(404).json({ status: false, msg: 'Email address not found!' });
    }

    const existing = await findPasswordReset(channel, value);
    const waitSec = secondsUntilOtpResend(existing?.created_at ?? null);
    if (waitSec > 0) {
      return res.status(405).json({
        status: false,
        msg: `Please try again after ${waitSec} seconds`,
      });
    }

    const token = generateResetOtp();
    await upsertPasswordReset(channel, value, token);

    if (channel === 'email') {
      const sent = await sendConsumerOtpEmail(value, token);
      if (!treatOtpDeliveryAsSuccess(sent)) {
        return res.status(405).json({
          status: false,
          msg: 'Failed to send email. Check admin mail settings or contact support.',
        });
      }
      return res.status(200).json({
        status: true,
        msg: exposeOtpInApiResponse()
          ? 'OTP generated (testing — see data.otp)'
          : 'OTP successfully sent to your email',
        data: {
          field_type: 'email',
          email_mask: maskEmailForClient(value),
          ...otpTestingFields(token),
        },
      });
    }

    const sent = await sendConsumerOtpSms(value, token);
    if (!treatOtpDeliveryAsSuccess(sent)) {
      return res.status(405).json({ status: false, msg: 'Failed to send SMS' });
    }

    return res.status(200).json({
      status: true,
      msg: exposeOtpInApiResponse()
        ? 'OTP generated (testing — see data.otp)'
        : 'OTP successfully sent to your phone',
      data: { field_type: 'phone', ...otpTestingFields(token) },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Verify reset OTP before new password screen
 * @Route POST /api/consumer/password/verify-otp
 * @Access Public
 */
export const verifyPasswordOtp = async (req: Request, res: Response): Promise<any> => {
  const validated = verifyPasswordOtpSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const body = validated.value as ResetIdentityBody & { otp: string };
  const { channel, value } = parseResetIdentity(body);

  try {
    const user = await findUserByResetIdentity(channel, value);
    if (!user) {
      const msg =
        channel === 'email' ? 'Email address not found!' : 'Phone number not found!';
      return res.status(404).json({ status: false, msg });
    }

    const valid = await verifyResetToken(channel, value, body.otp);
    if (!valid) {
      return res.status(400).json({ status: false, msg: 'Invalid OTP' });
    }

    return res.status(200).json({ status: true, msg: 'OTP found, you can proceed' });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Set new password with OTP
 * @Route PUT /api/consumer/password/reset
 * @Access Public
 */
export const resetPassword = async (req: Request, res: Response): Promise<any> => {
  const validated = resetPasswordSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const body = validated.value as ResetIdentityBody & {
    otp: string;
    password: string;
    confirm_password: string;
  };
  const { channel, value } = parseResetIdentity(body);

  try {
    const user = await findUserByResetIdentity(channel, value);
    if (!user) {
      const msg =
        channel === 'email' ? 'Email address not found!' : 'Phone number not found!';
      return res.status(404).json({ status: false, msg });
    }

    const valid = await verifyResetToken(channel, value, body.otp);
    if (!valid) {
      return res.status(400).json({ status: false, msg: 'Invalid OTP' });
    }

    const hashed = await bcrypt.hash(body.password, 10);
    await prisma.users.update({
      where: { id: user.id },
      data: { password: hashed, updated_at: new Date() },
    });
    await deletePasswordReset(channel, value);

    return res.status(200).json({ status: true, msg: 'Password changed successfully' });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};
