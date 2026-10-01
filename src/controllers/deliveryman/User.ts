import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  dmChangePasswordSchema,
  dmForgotPasswordSchema,
  dmLoginSchema,
  dmRegisterSchema,
  dmResetPasswordSchema,
  dmVerifyPasswordOtpSchema,
  dmFcmTokenSchema,
} from '../../schemas/deliveryman/User';
import { provisionAccountStorage } from '../../utils/accountStorage';
import { normalizeStoredMedia } from '../../utils/mediaStorage';
import {
  normalizeDriverRegisterBody,
  packIdentityImagesForDb,
  parseIdentityImagePaths,
} from '../../utils/deliveryman/registerHelpers';
import { getDeliveryManFcmTopics } from '../../utils/deliveryman/pushTopics';
import {
  deletePasswordReset,
  findPasswordReset,
  PasswordResetChannel,
  secondsUntilOtpResend,
  upsertPasswordReset,
  verifyResetToken,
} from '../../utils/consumer/passwordResetDb';
import { generateDmResetOtp, maskPhoneForClient } from '../../utils/deliveryman/authHelpers';
import { maskEmailForClient, sendConsumerOtpEmail } from '../../utils/consumer/sendConsumerOtpEmail';
import { sendConsumerOtpSms } from '../../utils/consumer/sendConsumerOtpSms';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

type ResetIdentityBody = {
  field_type: 'email' | 'phone';
  email?: string;
  phone?: string;
};

function requireDeliveryManId(req: Request, res: Response): number | null {
  const dmId = Number(req.user?.id);
  if (!dmId) {
    res.status(401).json({ status: false, msg: 'Unauthorized' });
    return null;
  }
  return dmId;
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

async function findDriverByResetIdentity(channel: PasswordResetChannel, value: string) {
  if (channel === 'email') {
    return prisma.delivery_men.findFirst({
      where: { email: { equals: value, mode: 'insensitive' } },
    });
  }
  return prisma.delivery_men.findFirst({ where: { phone: value } });
}

function formatDeliveryManPublic(dm: Record<string, unknown>) {
  const { password, auth_token, ...rest } = dm;
  void password;
  void auth_token;
  const formatted: Record<string, unknown> = { ...rest };
  if (formatted.id != null) {
    formatted.id = String(formatted.id);
  }
  if (formatted.zone_id != null) {
    formatted.zone_id = String(formatted.zone_id);
  }
  if (formatted.restaurant_id != null) {
    formatted.restaurant_id = String(formatted.restaurant_id);
  }
  if (formatted.vehicle_id != null) {
    formatted.vehicle_id = String(formatted.vehicle_id);
  }
  if (formatted.shift_id != null) {
    formatted.shift_id = String(formatted.shift_id);
  }
  return formatted;
}

/**
 * @Description Register Delivery Man (driver app — Figma 2-step form)
 * @Route POST /api/delivery-man/register
 * @Access Public
 * @Body Step 1: f_name, l_name, phone, email, password, confirm_password, image (portrait upload path)
 * @Body Step 2: zone_id (city), delivery_type|earning, identity_type, identity_number, identity_image (1–2 ID doc paths)
 * @Body Media: POST /storage/registration-init { role: deliveryman } → POST /upload → cloudflare_id + paths
 */
export const register = async (req: Request, res: Response): Promise<any> => {
  const payload = normalizeDriverRegisterBody(req.body);

  const result = dmRegisterSchema.validate(payload, { stripUnknown: true });
  if (result.error) {
    const errors = result.error.details.map((d) => d.message).join(',');
    return res.status(400).json({
      status: false,
      msg: errors,
    });
  }

  const data = result.value as {
    f_name: string;
    l_name: string;
    email: string;
    phone: string;
    password: string;
    identity_image: string | string[];
    image: string;
    cloudflare_id?: string | null;
    zone_id: number;
    identity_type: string;
    identity_number: string;
    earning?: boolean;
    vehicle_id?: number | null;
  };

  try {
    const existingDriver = await prisma.delivery_men.findFirst({
      where: {
        OR: [{ phone: data.phone }, { email: data.email }],
      },
    });

    if (existingDriver) {
      return res.status(400).json({
        status: false,
        msg: 'Phone or email already exists.',
      });
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    let cloudflareId: string;
    try {
      cloudflareId = await provisionAccountStorage('deliveryman', data.cloudflare_id);
    } catch (storageErr: unknown) {
      const msg = storageErr instanceof Error ? storageErr.message : 'Storage setup failed';
      return res.status(400).json({ status: false, msg });
    }

    const idPaths = parseIdentityImagePaths(data.identity_image);
    const { identity_image: identityStored, additional_documents } =
      packIdentityImagesForDb(idPaths);
    const profileImage = normalizeStoredMedia(data.image, 'placeholder_profile.png', 100);
    const earning = data.earning !== false;

    await prisma.delivery_men.create({
      data: {
        f_name: data.f_name,
        l_name: data.l_name,
        email: data.email,
        phone: data.phone,
        password: hashedPassword,
        cloudflareId,
        identity_type: data.identity_type,
        identity_number: data.identity_number,
        zone_id: data.zone_id,
        vehicle_id: data.vehicle_id ?? undefined,
        earning,
        application_status: 'pending',
        status: false,
        active: false,
        type: 'zone_wise',
        identity_image: identityStored,
        additional_documents: additional_documents ?? undefined,
        image: profileImage,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    return res.status(200).json({
      status: true,
      msg: 'Registration successful! Please wait for admin approval.',
      data: { application_status: 'pending', cloudflare_id: cloudflareId },
    });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      msg: error.message,
    });
  }
};

/**
 * @Description Login Delivery Man (Figma: phone + password)
 * @Route POST /api/delivery-man/login
 * @Access Public
 */
export const login = async (req: Request, res: Response): Promise<any> => {
  const payload = req.body;

  const result = dmLoginSchema.validate(payload);
  if (result.error) {
    const errors = result.error.details.map((d: any) => d.message).join(',');
    return res.status(400).json({
      status: false,
      msg: errors,
    });
  }

  try {
    const driver = await prisma.delivery_men.findUnique({
      where: { phone: payload.phone },
    });

    if (!driver) {
      return res.status(401).json({
        status: false,
        msg: 'Credential do not match, please try again.',
      });
    }

    const isPasswordValid = await bcrypt.compare(payload.password, driver.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        status: false,
        msg: 'Credential do not match, please try again.',
      });
    }

    if (driver.application_status !== 'approved') {
      return res.status(401).json({
        status: false,
        msg: 'Your application is not approved yet',
      });
    }

    if (!driver.status) {
      return res.status(401).json({
        status: false,
        msg: 'Your account has been suspended',
      });
    }

    const token = jwt.sign(
      { id: driver.id.toString(), phone: driver.phone, role: 'delivery_man' },
      JWT_SECRET,
      { expiresIn: '30d' }
    );

    await prisma.delivery_men.update({
      where: { id: driver.id },
      data: { auth_token: token } as any,
    });

    const fcmTopics = await getDeliveryManFcmTopics(driver);
    const topic = fcmTopics[0] ?? 'No_topic_found';

    return res.status(200).json({
      status: true,
      msg: 'Login success',
      data: {
        token,
        topic,
        id: driver.id.toString(),
        f_name: driver.f_name,
        l_name: driver.l_name,
        phone: driver.phone,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      msg: error.message,
    });
  }
};



/**
 * @Description Change password while logged in (driver app)
 * @Route PUT /api/delivery-man/password/change
 * @Access Private (Bearer delivery man JWT)
 */
export const changePassword = async (req: Request, res: Response): Promise<any> => {
  const dmId = requireDeliveryManId(req, res);
  if (dmId == null) return;

  const validated = dmChangePasswordSchema.validate(req.body, { stripUnknown: true });
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
    const driver = await prisma.delivery_men.findUnique({ where: { id: BigInt(dmId) } });
    if (!driver?.password) {
      return res.status(400).json({ status: false, msg: 'Password login is not set for this account' });
    }

    const matches = await bcrypt.compare(current_password, driver.password);
    if (!matches) {
      return res.status(403).json({ status: false, msg: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await prisma.delivery_men.update({
      where: { id: BigInt(dmId) },
      data: { password: hashed, updated_at: new Date() },
    });

    return res.status(200).json({ status: true, msg: 'Password successfully updated' });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
};

/**
 * @Description Forgot password — send OTP (Figma: reset screen, phone → Continue)
 * @Route POST /api/delivery-man/password/forgot
 * @Access Public
 */
export const forgotPassword = async (req: Request, res: Response): Promise<any> => {
  const validated = dmForgotPasswordSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const phone = String(validated.value.phone).trim();
  const channel: PasswordResetChannel = 'phone';

  try {
    const driver = await findDriverByResetIdentity(channel, phone);
    if (!driver) {
      return res.status(404).json({ status: false, msg: 'Phone number not found!' });
    }

    const existing = await findPasswordReset(channel, phone);
    const waitSec = secondsUntilOtpResend(existing?.created_at ?? null);
    if (waitSec > 0) {
      return res.status(405).json({
        status: false,
        msg: `Please try again after ${waitSec} seconds`,
        data: { resend_after_seconds: waitSec },
      });
    }

    const token = generateDmResetOtp();
    await upsertPasswordReset(channel, phone, token);

    let smsSent = false;
    let emailSent = false;

    try {
      smsSent = await sendConsumerOtpSms(phone, token);
    } catch {
      smsSent = false;
    }

    if (driver.email) {
      try {
        emailSent = await sendConsumerOtpEmail(driver.email, token);
      } catch {
        emailSent = false;
      }
    }

    if (!smsSent && !emailSent && process.env.APP_MODE !== 'test') {
      return res.status(405).json({ status: false, msg: 'Failed to send OTP' });
    }

    return res.status(200).json({
      status: true,
      msg: 'OTP successfully sent',
      data: {
        field_type: 'phone',
        phone_mask: maskPhoneForClient(phone),
        email_mask: driver.email ? maskEmailForClient(driver.email) : null,
        resend_after_seconds: 60,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
};

/**
 * @Description Verify OTP (Figma: 4-digit OTP screen → Continue)
 * @Route POST /api/delivery-man/password/verify-otp
 * @Access Public
 */
export const verifyPasswordOtp = async (req: Request, res: Response): Promise<any> => {
  const validated = dmVerifyPasswordOtpSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const { phone, otp } = validated.value as { phone: string; otp: string };
  const channel: PasswordResetChannel = 'phone';

  try {
    const driver = await findDriverByResetIdentity(channel, phone.trim());
    if (!driver) {
      return res.status(404).json({ status: false, msg: 'Phone number not found!' });
    }

    const valid = await verifyResetToken(channel, phone.trim(), otp);
    if (!valid) {
      return res.status(400).json({ status: false, msg: 'Invalid OTP' });
    }

    return res.status(200).json({
      status: true,
      msg: 'OTP verified, you can set a new password',
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
};

/**
 * @Description Create new password (Figma: password + confirm → Continue)
 * @Route PUT /api/delivery-man/password/reset
 * @Access Public
 */
export const resetPassword = async (req: Request, res: Response): Promise<any> => {
  const validated = dmResetPasswordSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const body = validated.value as {
    phone: string;
    otp: string;
    password: string;
    confirm_password: string;
  };
  const phone = body.phone.trim();
  const channel: PasswordResetChannel = 'phone';

  try {
    const driver = await findDriverByResetIdentity(channel, phone);
    if (!driver) {
      return res.status(404).json({ status: false, msg: 'Phone number not found!' });
    }

    const valid = await verifyResetToken(channel, phone, body.otp);
    if (!valid) {
      return res.status(400).json({ status: false, msg: 'Invalid OTP' });
    }

    const hashed = await bcrypt.hash(body.password, 10);
    await prisma.delivery_men.update({
      where: { id: driver.id },
      data: {
        password: hashed,
        auth_token: null,
        updated_at: new Date(),
      },
    });
    await deletePasswordReset(channel, phone);

    return res.status(200).json({
      status: true,
      msg: 'Password changed successfully',
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
};

/**
 * @Description Current delivery man account (driver app)
 * @Route GET /api/delivery-man/whoami
 * @Access Private (Bearer delivery man JWT)
 */
export const whoami = async (req: Request, res: Response): Promise<any> => {
  const dmId = requireDeliveryManId(req, res);
  if (dmId == null) return;

  try {
    const driver = await prisma.delivery_men.findUnique({
      where: { id: BigInt(dmId) },
    });

    if (!driver) {
      return res.status(404).json({ status: false, msg: 'Delivery man not found' });
    }

    return res.status(200).json({
      status: true,
      msg: 'Success',
      data: formatDeliveryManPublic(driver as unknown as Record<string, unknown>),
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
};


/**
 * @Description Update FCM Token
 * @Route PUT /api/delivery-man/fcm-token
 * @Access Private (Bearer delivery man JWT)
 */
export const updateFcmToken = async (req: Request, res: Response): Promise<any> => {
  const dmId = requireDeliveryManId(req, res);
  if (dmId == null) return;

  const validated = dmFcmTokenSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const { fcm_token } = validated.value as { fcm_token: string };

  try {
    await prisma.delivery_men.update({
      where: { id: BigInt(dmId) },
      data: { fcm_token, updated_at: new Date() },
    });

    return res.status(200).json({
      status: true,
      msg: 'Successfully updated',
      message: 'successfully updated!',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};