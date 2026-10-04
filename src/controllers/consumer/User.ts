//NPM Packages
import { Request, Response } from 'express';
import prisma from '../../config/database';
import { safeApiErrorMessage } from '../../utils/safeApiError';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

//Schema
import {
  consumerApplyDeliveryManSchema,
  consumerApplyRestaurantSchema,
  consumerGoogleSignInSchema,
  consumerLoginSchema,
  consumerLoginSendOtpSchema,
  consumerLoginVerifyOtpSchema,
  consumerRegisterSchema,
} from '../../schemas/consumer/User';
import { generateResetOtp } from '../../utils/consumer/passwordResetDb';
import { sendConsumerOtpSms } from '../../utils/consumer/sendConsumerOtpSms';
import { maskPhoneForClient } from '../../utils/deliveryman/authHelpers';
import {
  deleteLoginOtp,
  findLoginOtp,
  secondsUntilOtpResend as loginOtpResendSeconds,
  upsertLoginOtp,
  verifyLoginOtpToken,
} from '../../utils/partner/loginOtpDb';
import {
  isGoogleAccessTokenFlag,
  processConsumerSocialLogin,
  verifyGoogleToken,
} from '../../utils/consumer/socialLogin';
import { parseZoneIdsFromRequest } from '../../utils/consumer/favouriteHelpers';
import { verifyResetToken } from '../../utils/consumer/passwordResetDb';
import { provisionAccountStorage } from '../../utils/accountStorage';
import { normalizeStoredMedia } from '../../utils/mediaStorage';
import { issueGuestJwt } from '../../utils/consumer/guestAuth';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

// Helper to generate unique referral code
const generateReferralCode = async (f_name: string, id: number): Promise<string> => {
    let code = `${f_name.substring(0, 3).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}${id}`;
    let exists = await prisma.users.findFirst({ where: { ref_code: code } });
    while (exists) {
        code = `${f_name.substring(0, 3).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}${id}`;
        exists = await prisma.users.findFirst({ where: { ref_code: code } });
    }
    return code;
};

/**
 * @Description Register Consumer
 * @Route POST api/consumer/register
 * @Access Public
 */
export const register = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;

    const result = consumerRegisterSchema.validate(payload);
    if (result.error) {
        const errors = result.error.details.map((d: any) => d.message).join(",");
        return res.status(403).json({
            status: false,
            msg: errors
        });
    }

    try {
        // Check if phone or email already exists
        const existingUser = await prisma.users.findFirst({
            where: {
                OR: [
                    { phone: payload.phone },
                    ...(payload.email ? [{ email: payload.email }] : [])
                ]
            }
        });

        if (existingUser) {
            return res.status(403).json({
                status: false,
                msg: 'Phone or email is already registered.'
            });
        }

        // Handle referral code
        if (payload.ref_code) {
            const refStatus = await prisma.business_settings.findFirst({ where: { key: 'ref_earning_status' } });
            if (!refStatus || refStatus.value !== '1') {
                return res.status(403).json({ status: false, msg: 'Referral code is currently disabled.' });
            }
            // Add business logic to reward referee here if needed
        }

        const hashedPassword = await bcrypt.hash(payload.password, 10);

        let newUser = await prisma.users.create({
            data: {
                f_name: payload.f_name,
                l_name: payload.l_name || '',
                phone: payload.phone,
                email: payload.email || null,
                password: hashedPassword,
                status: true // consumers are typically active upon registration
            }
        });

        // Generate and update ref_code
        const refCode = await generateReferralCode(newUser.f_name || 'USR', Number(newUser.id));
        newUser = await prisma.users.update({
            where: { id: newUser.id },
            data: { ref_code: refCode }
        });

        return res.status(200).json({
            status: true,
            msg: 'Registration successful!',
            data: {
                id: newUser.id.toString(),
                f_name: newUser.f_name,
                l_name: newUser.l_name,
                phone: newUser.phone,
                email: newUser.email,
                ref_code: newUser.ref_code
            }
        });
    } catch (error: any) {
        return res.status(500).json({
            status: false,
            msg: error.message
        });
    }
};

/**
 * Helper to check and merge guest cart to user cart
 */
const checkGuestCart = async (userId: number, guestId: number) => {
    if (!guestId || !userId) return;

    // Get all guest cart items
    const guestCartItems = await prisma.carts.findMany({
        where: { user_id: guestId }
    });

    if (guestCartItems.length === 0) return;

    const itemIds = guestCartItems.map(c => Number(c.item_id));

    // Get the corresponding food items to find the restaurant_ids
    const foodItems = await prisma.food.findMany({
        where: { id: { in: itemIds.map(id => BigInt(id)) } },
        select: { id: true, restaurant_id: true }
    });

    const guestStoreIds = foodItems.map(f => Number(f.restaurant_id)).filter(id => !isNaN(id));

    if (guestStoreIds.length > 0) {
        // Delete user's existing cart items from these restaurants to avoid collision
        // We have to find carts matching the user and those store IDs
        // Since carts don't have a direct relation in Prisma, we do it in two steps:
        const userCarts = await prisma.carts.findMany({
            where: { user_id: userId }
        });
        
        const userCartItemIds = userCarts.map(c => Number(c.item_id));
        
        const userFoods = await prisma.food.findMany({
            where: {
                id: { in: userCartItemIds.map(id => BigInt(id)) },
                restaurant_id: { in: guestStoreIds }
            },
            select: { id: true }
        });

        const foodIdsToDelete = userFoods.map(f => Number(f.id));

        if (foodIdsToDelete.length > 0) {
            await prisma.carts.deleteMany({
                where: {
                    user_id: userId,
                    item_id: { in: foodIdsToDelete }
                }
            });
        }

        // Update guest cart to belong to the logged-in user
        await prisma.carts.updateMany({
            where: { user_id: guestId },
            data: { user_id: userId, is_guest: false }
        });
    }
};

type ConsumerUserRecord = NonNullable<Awaited<ReturnType<typeof prisma.users.findFirst>>>;

async function issueConsumerLoginSession(
  user: ConsumerUserRecord,
  res: Response,
  options?: { guest_id?: number; login_type?: 'manual' | 'otp' }
): Promise<any> {
  if (!user.status) {
    return res.status(403).json({
      status: false,
      msg: 'Your account is blocked',
    });
  }

  if (!user.ref_code) {
    const refCode = await generateReferralCode(user.f_name || 'USR', Number(user.id));
    await prisma.users.update({
      where: { id: user.id },
      data: { ref_code: refCode },
    });
  }

  const guestId = options?.guest_id;
  if (guestId) {
    await checkGuestCart(Number(user.id), guestId);
  }

  const token = jwt.sign(
    {
      id: user.id.toString(),
      email: user.email,
      phone: user.phone,
      role: 'customer',
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  return res.status(200).json({
    status: true,
    msg: 'Login success',
    data: {
      token,
      is_phone_verified: user.is_phone_verified ? 1 : 0,
      is_email_verified: 1,
      login_type: options?.login_type ?? 'manual',
    },
  });
}

/**
 * @Description Send login OTP (customer app — phone sign-in)
 * @Route POST /api/consumer/login/send-otp
 * @Access Public
 */
export const sendLoginOtp = async (req: Request, res: Response): Promise<any> => {
  const validated = consumerLoginSendOtpSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const phone = String(validated.value.phone).trim();

  try {
    const user = await prisma.users.findFirst({ where: { phone } });
    if (!user) {
      return res.status(401).json({
        status: false,
        msg: 'Credential do not match, please try again.',
      });
    }

    if (!user.status) {
      return res.status(403).json({
        status: false,
        msg: 'Your account is blocked',
      });
    }

    const existing = await findLoginOtp(phone, 'login_consumer');
    const waitSec = loginOtpResendSeconds(existing?.created_at ?? null);
    if (waitSec > 0) {
      return res.status(405).json({
        status: false,
        msg: `Please try again after ${waitSec} seconds`,
        data: { resend_after_seconds: waitSec },
      });
    }

    const otp = generateResetOtp();
    await upsertLoginOtp(phone, 'login_consumer', otp);

    try {
      await sendConsumerOtpSms(phone, otp);
    } catch {
      // SMS optional while OTP is returned in the response for development.
    }

    return res.status(200).json({
      status: true,
      msg: 'OTP successfully sent',
      data: {
        phone_mask: maskPhoneForClient(phone),
        otp,
        resend_after_seconds: 60,
      },
    });
  } catch (error: unknown) {
    console.error('[consumer/send-login-otp]', error);
    return res.status(503).json({
      status: false,
      msg: safeApiErrorMessage(error, 'Could not send OTP. Please try again.'),
    });
  }
};

/**
 * @Description Verify login OTP and issue JWT (customer app)
 * @Route POST /api/consumer/login/verify-otp
 * @Access Public
 */
export const verifyLoginOtp = async (req: Request, res: Response): Promise<any> => {
  const validated = consumerLoginVerifyOtpSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const { phone: rawPhone, otp, guest_id: guestId } = validated.value as {
    phone: string;
    otp: string;
    guest_id?: number;
  };
  const phone = rawPhone.trim();

  try {
    const user = await prisma.users.findFirst({ where: { phone } });
    if (!user) {
      return res.status(401).json({
        status: false,
        msg: 'Credential do not match, please try again.',
      });
    }

    const valid = await verifyLoginOtpToken(phone, 'login_consumer', otp);
    if (!valid) {
      return res.status(400).json({ status: false, msg: 'Invalid OTP' });
    }

    await deleteLoginOtp(phone, 'login_consumer');
    return issueConsumerLoginSession(user, res, { guest_id: guestId, login_type: 'otp' });
  } catch (error: unknown) {
    console.error('[consumer/verify-login-otp]', error);
    return res.status(503).json({
      status: false,
      msg: safeApiErrorMessage(error, 'Login failed. Please try again.'),
    });
  }
};

/**
 * @Description Login Consumer
 * @Route POST api/consumer/login
 * @Access Public
 */
export const login = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;

    const result = consumerLoginSchema.validate(payload);
    if (result.error) {
        const errors = result.error.details.map((d: any) => d.message).join(",");
        return res.status(403).json({
            status: false,
            msg: errors
        });
    }

    try {
        if (payload.login_type === 'manual') {
            const user = await prisma.users.findFirst({
                where: payload.field_type === 'email' 
                    ? { email: payload.email_or_phone } 
                    : { phone: payload.email_or_phone }
            });

            if (!user) {
                return res.status(401).json({
                    status: false,
                    msg: 'Credential do not match, please try again.'
                });
            }

            // Verify password
            const isPasswordValid = await bcrypt.compare(payload.password, user.password || '');
            if (!isPasswordValid) {
                return res.status(401).json({
                    status: false,
                    msg: 'Credential do not match, please try again.'
                });
            }

            return issueConsumerLoginSession(user, res, {
                guest_id: payload.guest_id,
                login_type: 'manual',
            });

        } else if (payload.login_type === 'otp') {
            return res.status(400).json({
                status: false,
                msg: 'Use POST /consumer/login/send-otp and POST /consumer/login/verify-otp for OTP login.',
            });
        } else if (payload.login_type === 'social') {
            if (payload.medium !== 'google') {
                return res.status(501).json({
                    status: false,
                    msg: 'Only Google social login is migrated; use medium=google or POST /sign-in-with-google.',
                });
            }

            const useAccessToken = isGoogleAccessTokenFlag(payload.access_token);

            let profile;
            try {
                profile = await verifyGoogleToken(payload.token, useAccessToken);
            } catch (err: unknown) {
                const statusCode =
                    err && typeof err === 'object' && 'statusCode' in err
                        ? Number((err as { statusCode: number }).statusCode)
                        : 403;
                const msg = err instanceof Error ? err.message : 'Invalid Google credentials.';
                return res.status(statusCode).json({ status: false, msg });
            }

            if (
                payload.email !== profile.email &&
                !profile.id &&
                !profile.kid &&
                !profile.sub
            ) {
                return res.status(403).json({ status: false, msg: 'Email does not match Google account.' });
            }

            try {
                const data = await processConsumerSocialLogin(profile, {
                    token: payload.token,
                    email: payload.email,
                    unique_id: payload.unique_id,
                    medium: 'google',
                    verified: payload.verified,
                    guest_id: payload.guest_id,
                });

                const msg = data.token
                    ? 'Login success'
                    : data.is_exist_user
                      ? 'An account with this email already exists. Confirm to link Google sign-in.'
                      : 'Complete your profile to continue.';

                return res.status(200).json({
                    status: true,
                    msg,
                    data,
                });
            } catch (err: unknown) {
                const statusCode =
                    err && typeof err === 'object' && 'statusCode' in err
                        ? Number((err as { statusCode: number }).statusCode)
                        : 403;
                const msg = err instanceof Error ? err.message : 'Social login failed.';
                return res.status(statusCode).json({ status: false, msg });
            }
        }

    } catch (error: unknown) {
        console.error('[consumer/login]', error);
        return res.status(503).json({
            status: false,
            msg: safeApiErrorMessage(error, 'Login failed. Please try again.'),
        });
    }
};

/**
 * @Description Guest User Registration
 * @Route POST api/consumer/guest/request
 * @Access Public
 */
export const guestRequest = async (req: Request, res: Response): Promise<any> => {
    try {
        const payload = req.body;
        // Grab IP Address from request
        const ipAddress = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();

        const guest = await prisma.guests.create({
            data: {
                ip_address: ipAddress,
                fcm_token: payload.fcm_token || null
            }
        });

        if (guest) {
            const guestId = guest.id.toString();
            const token = issueGuestJwt(guest.id);
            return res.status(200).json({
                status: true,
                msg: 'Guest verified successfully',
                guest_id: guestId,
                data: {
                    guest_id: guestId,
                    token,
                },
            });
        }

        return res.status(404).json({
            status: false,
            msg: 'Failed to create guest'
        });
    } catch (error: any) {
        return res.status(500).json({
            status: false,
            msg: error.message
        });
    }
};


/**
 * @Description Apply as restaurant partner (customer app — Figma restaurant screen)
 * @Route POST /api/consumer/apply/restaurant
 * @Access Bearer consumer (owner name/phone/email from profile; no password on this step)
 */
export const applyForRestaurant = async (req: Request, res: Response): Promise<any> => {
  const result = consumerApplyRestaurantSchema.validate(req.body, { stripUnknown: true });
  if (result.error) {
    const errors = result.error.details.map((d) => d.message).join(',');
    return res.status(400).json({ status: false, msg: errors });
  }

  const payload = result.value;
  const user = req.user;
  if (!user?.phone) {
    return res.status(400).json({ status: false, msg: 'Complete your profile phone before applying.' });
  }
  if (!user.email) {
    return res.status(400).json({
      status: false,
      msg: 'Add an email on your profile before applying as a restaurant.',
    });
  }

  try {
    const existingVendor = await prisma.vendors.findFirst({
      where: { OR: [{ email: user.email }, { phone: user.phone }] },
    });
    if (existingVendor) {
      return res.status(400).json({ status: false, msg: 'You already have a vendor application on this account.' });
    }

    const tempPassword = crypto.randomBytes(16).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    let cloudflareId: string;
    try {
      cloudflareId = await provisionAccountStorage('vendor', payload.cloudflare_id);
    } catch (storageErr: unknown) {
      const msg = storageErr instanceof Error ? storageErr.message : 'Storage setup failed';
      return res.status(400).json({ status: false, msg });
    }

    const logo = normalizeStoredMedia(payload.logo, 'default_logo.png');
    const coverPhoto = normalizeStoredMedia(payload.cover_photo, 'default_cover.png');

    await prisma.$transaction(async (prismaTx) => {
      const vendor = await prismaTx.vendors.create({
        data: {
          f_name: user.f_name || 'Owner',
          l_name: user.l_name || '',
          email: user.email,
          phone: user.phone,
          password: hashedPassword,
          cloudflareId,
          status: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });

      const restaurant = await prismaTx.restaurants.create({
        data: {
          name: payload.restaurant_name,
          address: payload.restaurant_address,
          phone: user.phone,
          email: user.email,
          latitude: payload.lat != null ? String(payload.lat) : '0',
          longitude: payload.lng != null ? String(payload.lng) : '0',
          vendor_id: Number(vendor.id),
          zone_id: payload.zone_id,
          tax: payload.tax,
          delivery_time: '30-45-min',
          status: false,
          restaurant_model: 'none',
          logo,
          cover_photo: coverPhoto,
          additional_data: JSON.stringify({ default_language: payload.language || 'en' }),
          created_at: new Date(),
          updated_at: new Date(),
        },
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
    });

    return res.status(200).json({
      status: true,
      msg: 'Application submitted! Please wait for admin approval.',
      data: { application_status: 'pending', cloudflare_id: cloudflareId },
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
};

/**
 * @Description Apply as delivery driver (customer app — Figma delivery man screen)
 * @Route POST /api/consumer/apply/delivery-man
 * @Access Public
 */
export const applyForDeliveryMan = async (req: Request, res: Response): Promise<any> => {
  const result = consumerApplyDeliveryManSchema.validate(req.body, { stripUnknown: true });
  if (result.error) {
    const errors = result.error.details.map((d) => d.message).join(',');
    return res.status(400).json({ status: false, msg: errors });
  }

  const data = result.value as {
    f_name: string;
    l_name: string;
    phone: string;
    email: string;
    password: string;
    identity_image?: string | null;
    image?: string | null;
    cloudflare_id?: string | null;
    otp: string;
    zone_id?: number;
  };

  const zoneFromHeader = parseZoneIdsFromRequest(req)?.[0];
  const zone_id = data.zone_id ?? zoneFromHeader;
  if (!zone_id) {
    return res.status(400).json({
      status: false,
      msg: 'zone_id is required (query, body, or legacy zoneId header).',
    });
  }

  const otpValid = await verifyResetToken('phone', data.phone, data.otp);
  if (!otpValid) {
    return res.status(400).json({ status: false, msg: 'Invalid or expired OTP.' });
  }

  try {
    const existingDriver = await prisma.delivery_men.findFirst({
      where: { OR: [{ phone: data.phone }, { email: data.email }] },
    });
    if (existingDriver) {
      return res.status(400).json({ status: false, msg: 'Phone or email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    let cloudflareId: string;
    try {
      cloudflareId = await provisionAccountStorage('deliveryman', data.cloudflare_id);
    } catch (storageErr: unknown) {
      const msg = storageErr instanceof Error ? storageErr.message : 'Storage setup failed';
      return res.status(400).json({ status: false, msg });
    }

    const identityImage = normalizeStoredMedia(data.identity_image, 'placeholder_id.png');
    const profileImage = normalizeStoredMedia(data.image, 'placeholder_profile.png', 100);

    await prisma.delivery_men.create({
      data: {
        f_name: data.f_name,
        l_name: data.l_name,
        email: data.email,
        phone: data.phone,
        password: hashedPassword,
        cloudflareId,
        identity_type: 'nid',
        identity_number: '',
        zone_id,
        earning: true,
        application_status: 'pending',
        status: false,
        active: false,
        type: 'zone_wise',
        identity_image: identityImage,
        image: profileImage,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    return res.status(200).json({
      status: true,
      msg: 'Application submitted! Please wait for admin approval.',
      data: { application_status: 'pending', cloudflare_id: cloudflareId },
    });
  } catch (error: any) {
    return res.status(500).json({ status: false, msg: error.message });
  }
};


/**
 * @Description Sign in with Google
 * @Route POST api/consumer/sign-in-with-google
 * @Access Public
 */
export const signInWithGoogle = async (req: Request, res: Response): Promise<any> => {
  const result = consumerGoogleSignInSchema.validate(req.body, { stripUnknown: true });
  if (result.error) {
    const errors = result.error.details.map((d) => d.message).join(', ');
    return res.status(403).json({ status: false, msg: errors });
  }

  const payload = result.value as {
    token: string;
    email: string;
    unique_id: string;
    access_token?: number | boolean;
    guest_id?: number;
    verified?: 'default' | 'no';
  };

  const useAccessToken = isGoogleAccessTokenFlag(payload.access_token);

  try {
    const profile = await verifyGoogleToken(payload.token, useAccessToken);

    const email = (payload.email?.trim() || profile.email).toLowerCase();
    const unique_id =
      payload.unique_id?.trim() || profile.sub || profile.id || profile.kid || '';

    if (!unique_id) {
      return res.status(403).json({ status: false, msg: 'Invalid Google credentials.' });
    }

    if (payload.email && payload.email.trim().toLowerCase() !== profile.email.toLowerCase()) {
      return res.status(403).json({ status: false, msg: 'Email does not match Google account.' });
    }

    const data = await processConsumerSocialLogin(profile, {
      token: payload.token,
      email,
      unique_id,
      medium: 'google',
      verified: payload.verified ?? 'default',
      guest_id: payload.guest_id,
    });

    const msg = data.token
      ? 'Login success'
      : data.is_exist_user
        ? 'An account with this email already exists. Confirm to link Google sign-in.'
        : 'Complete your profile to continue.';

    return res.status(200).json({
      status: true,
      msg,
      data,
    });
  } catch (err: unknown) {
    console.error('[consumer/sign-in-with-google]', err);
    const statusCode =
      err && typeof err === 'object' && 'statusCode' in err
        ? Number((err as { statusCode: number }).statusCode)
        : 403;
    const msg =
      err instanceof Error ? err.message : safeApiErrorMessage(err, 'Google sign-in failed.');
    return res.status(statusCode).json({ status: false, msg });
  }
};