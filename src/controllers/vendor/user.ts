import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { genrateToken } from '../../utils/methods/methods';
import {
  vendorFcmTokenSchema,
  vendorLoginSchema,
  vendorRegisterSchema,
} from '../../schemas/vendor/User';
import {
  vendorChangePasswordSchema,
  vendorForgotPasswordSchema,
  vendorResetPasswordSchema,
  vendorVerifyPasswordOtpSchema,
} from '../../schemas/vendor/password';
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
import { provisionAccountStorage } from '../../utils/accountStorage';
import { normalizeStoredMedia } from '../../utils/mediaStorage';

const prisma = new PrismaClient();

type ResetIdentityBody = {
  field_type: 'email' | 'phone';
  email?: string;
  phone?: string;
};

function requireVendorId(req: Request, res: Response): number | null {
  const vendorId = Number(req.user?.id);
  if (!vendorId) {
    res.status(401).json({ status: false, msg: 'Unauthorized' });
    return null;
  }
  return vendorId;
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

async function findVendorByResetIdentity(channel: PasswordResetChannel, value: string) {
  if (channel === 'email') {
    return prisma.vendors.findFirst({
      where: { email: { equals: value, mode: 'insensitive' } },
    });
  }
  return prisma.vendors.findFirst({ where: { phone: value } });
}
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

/**
 * @Description Login Vendor
 * @Route POST api/vendor/login
 * @Access Public
 */
export const login = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;

       const result = vendorLoginSchema.validate(payload);
      if (result.error) {
          const errors = result.error.details.map((d: any) => d.message).join(",");
          return res.status(400).json({
              status: false,
              msg: errors
          });
      }
  try {

    const vendor = await prisma.vendors.findUnique({
      where: { email : payload.email},
    });

    if (!vendor) {
      return res.status(401).json({ status: false, msg: 'Credential do not match, please try again.' });
    }

    const isPasswordValid = await bcrypt.compare(payload.password, vendor?.password || '');
    
    if (!isPasswordValid) {
      return res.status(401).json({
        status: false,
        msg: 'Credential do not match, please try again.'
      });
    }

    const restaurants = await prisma.restaurants.findMany({
      where: { vendor_id: Number(vendor.id) },
    });
    
    const restaurant = restaurants[0];

    if (restaurant?.status === false && vendor.status === false) {
      return res.status(403).json({
        status: false,
        msg: 'Your registration is not approved yet. You can login once admin approved the request'
      });
    } else if (restaurant?.status === false && vendor.status === true) {
      return res.status(403).json({
        status: false,
        msg: 'Your account is suspended'
      });
    }

    const tokenData = await genrateToken(vendor, restaurant, JWT_SECRET);

    if (restaurant?.restaurant_model === 'none' || restaurant?.restaurant_model === 'unsubscribed') {
        return res.status(200).json({
            subscribed: {
                restaurant_id: Number(restaurant?.id),
                token: tokenData.token,
                package_id: restaurant?.package_id ? Number(restaurant.package_id) : null,
                zone_wise_topic: tokenData.zone_wise_topic,
                type: 'new_join'
            }
        });
    }

    return res.status(200).json({
      status: true,
      msg: 'Login success',
      data : {...tokenData}
    });

  } catch (error: any) {
    return res.status(500).json({
      status: false,
      msg: error.message
    });
  }
};

/**
 * @Description Register Vendor
 * @Route POST api/vendor/register
 * @Access Public
 */
export const register = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;

    const result = vendorRegisterSchema.validate(payload);
    if (result.error) {
        const errors = result.error.details.map((d: any) => d.message).join(",");
        return res.status(400).json({
            status: false,
            msg: errors
        });
    }

    try {
        // 1. Check if email or phone already exists
        const existingVendor = await prisma.vendors.findFirst({
            where: {
                OR: [
                    { email: payload.email },
                    { phone: payload.phone }
                ]
            }
        });

        if (existingVendor) {
            return res.status(400).json({
                status: false,
                msg: 'Email or phone already exists.'
            });
        }

        // 2. Hash password
        const hashedPassword = await bcrypt.hash(payload.password, 10);

        let cloudflareId: string;
        try {
            cloudflareId = await provisionAccountStorage('vendor', payload.cloudflare_id);
        } catch (storageErr: unknown) {
            const msg = storageErr instanceof Error ? storageErr.message : 'Storage setup failed';
            return res.status(400).json({ status: false, msg });
        }

        const logo = normalizeStoredMedia(payload.logo, 'default_logo.png');
        const coverPhoto = normalizeStoredMedia(payload.cover_photo, 'default_cover.png');

        // 3. Create Vendor and Restaurant safely in a transaction
        await prisma.$transaction(async (prismaTx) => {
            const vendor = await prismaTx.vendors.create({
                data: {
                    f_name: payload.f_name,
                    l_name: payload.l_name,
                    email: payload.email,
                    phone: payload.phone,
                    password: hashedPassword,
                    cloudflareId,
                    status: false, // Pending admin approval
                    created_at: new Date(),
                    updated_at: new Date()
                }
            });

            const restaurant = await prismaTx.restaurants.create({
                data: {
                    name: payload.restaurant_name,
                    address: payload.restaurant_address,
                    phone: payload.phone,
                    email: payload.email,
                    latitude: payload.lat != null ? String(payload.lat) : '0',
                    longitude: payload.lng != null ? String(payload.lng) : '0',
                    vendor_id: Number(vendor.id),
                    zone_id: payload.zone_id,
                    tax: payload.tax,
                    delivery_time: `${payload.minimum_delivery_time || '30'}-${payload.maximum_delivery_time || '45'}-${payload.delivery_time_type || 'min'}`,
                    status: false, // Pending admin approval
                    restaurant_model: 'none',
                    logo,
                    cover_photo: coverPhoto,
                    additional_data: JSON.stringify({
                        default_language: payload.language || 'en',
                    }),
                    created_at: new Date(),
                    updated_at: new Date()
                }
            });

            const cuisineIds: number[] = Array.isArray(payload.cuisines)
              ? payload.cuisines.map((id: unknown) => Number(id)).filter((n: number) => Number.isFinite(n))
              : [];
            if (cuisineIds.length) {
              await prismaTx.cuisine_restaurant.createMany({
                data: cuisineIds.map((cuisine_id) => ({
                  restaurant_id: Number(restaurant.id),
                  cuisine_id,
                })),
              });
            }
        }, { maxWait: 10000, timeout: 30000 });

        return res.status(200).json({
            status: true,
            msg: 'Registration successful! Please wait for admin approval.',
            data: { application_status: 'pending', cloudflare_id: cloudflareId },
        });

    } catch (error: any) {
        return res.status(500).json({
            status: false,
            msg: error.message
        });
    }
};

/**
 * @Description Change password while logged in (vendor app / web panel profile)
 * @Route PUT /api/vendor/password/change
 * @Access Private (Bearer vendor JWT)
 */
export const changePassword = async (req: Request, res: Response): Promise<any> => {
  const vendorId = requireVendorId(req, res);
  if (vendorId == null) return;

  const validated = vendorChangePasswordSchema.validate(req.body, { stripUnknown: true });
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
    const vendor = await prisma.vendors.findUnique({ where: { id: BigInt(vendorId) } });
    if (!vendor?.password) {
      return res.status(400).json({ status: false, msg: 'Password login is not set for this account' });
    }

    const matches = await bcrypt.compare(current_password, vendor.password);
    if (!matches) {
      return res.status(403).json({ status: false, msg: 'Current password is incorrect' });
    }

    const hashed = await bcrypt.hash(password, 10);
    await prisma.vendors.update({
      where: { id: BigInt(vendorId) },
      data: { password: hashed, updated_at: new Date() },
    });

    return res.status(200).json({ status: true, msg: 'Password successfully updated' });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Forgot password — send OTP (vendor app Figma: phone; email also supported)
 * @Route POST /api/vendor/password/forgot
 * @Access Public
 */
export const forgotPassword = async (req: Request, res: Response): Promise<any> => {
  const validated = vendorForgotPasswordSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const body = validated.value as ResetIdentityBody;
  const { channel, value } = parseResetIdentity(body);

  try {
    const vendor = await findVendorByResetIdentity(channel, value);
    if (!vendor) {
      const msg =
        channel === 'email' ? 'Email address not found!' : 'Phone number not found!';
      return res.status(404).json({ status: false, msg });
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
      if (!sent) {
        return res.status(405).json({ status: false, msg: 'Failed to send email' });
      }
      return res.status(200).json({
        status: true,
        msg: 'OTP successfully sent to your email',
        data: {
          field_type: 'email',
          email_mask: maskEmailForClient(value),
        },
      });
    }

    const sent = await sendConsumerOtpSms(value, token);
    if (!sent) {
      return res.status(405).json({ status: false, msg: 'Failed to send SMS' });
    }

    return res.status(200).json({
      status: true,
      msg: 'OTP successfully sent to your phone',
      data: { field_type: 'phone' },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Verify forgot-password OTP (vendor app OTP screen)
 * @Route POST /api/vendor/password/verify-otp
 * @Access Public
 */
export const verifyPasswordOtp = async (req: Request, res: Response): Promise<any> => {
  const validated = vendorVerifyPasswordOtpSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const body = validated.value as ResetIdentityBody & { otp: string };
  const { channel, value } = parseResetIdentity(body);

  try {
    const vendor = await findVendorByResetIdentity(channel, value);
    if (!vendor) {
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
 * @Description Reset password with OTP (vendor app create new password screen)
 * @Route PUT /api/vendor/password/reset
 * @Access Public
 */
export const resetPassword = async (req: Request, res: Response): Promise<any> => {
  const validated = vendorResetPasswordSchema.validate(req.body, { stripUnknown: true });
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
    const vendor = await findVendorByResetIdentity(channel, value);
    if (!vendor) {
      const msg =
        channel === 'email' ? 'Email address not found!' : 'Phone number not found!';
      return res.status(404).json({ status: false, msg });
    }

    const valid = await verifyResetToken(channel, value, body.otp);
    if (!valid) {
      return res.status(400).json({ status: false, msg: 'Invalid OTP' });
    }

    const hashed = await bcrypt.hash(body.password, 10);
    await prisma.vendors.update({
      where: { id: vendor.id },
      data: {
        password: hashed,
        auth_token: null,
        updated_at: new Date(),
      },
    });
    await deletePasswordReset(channel, value);

    return res.status(200).json({ status: true, msg: 'Password changed successfully' });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Update FCM device token (POS / vendor mobile or web panel)
 * @Route PUT /api/vendor/fcm-token
 * @Access Private (Bearer vendor JWT)
 */
export const updateFcmToken = async (req: Request, res: Response): Promise<any> => {
  const vendorId = requireVendorId(req, res);
  if (vendorId == null) return;

  const validated = vendorFcmTokenSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const { fcm_token, platform } = validated.value as {
    fcm_token: string;
    platform: 'mobile' | 'web';
  };

  const data =
    platform === 'web'
      ? { fcm_token_web: fcm_token, updated_at: new Date() }
      : { firebase_token: fcm_token, updated_at: new Date() };

  try {
    await prisma.vendors.update({
      where: { id: BigInt(vendorId) },
      data,
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
