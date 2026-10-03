import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../../config/database';

export type GoogleTokenProfile = {
  email: string;
  sub?: string;
  id?: string;
  kid?: string;
  /** From Google tokeninfo / userinfo — when true, email ownership is proven by Google. */
  email_verified?: boolean;
};

export type SocialLoginRequest = {
  token: string;
  email: string;
  unique_id: string;
  medium: 'google' | 'facebook' | 'apple';
  verified?: 'default' | 'no';
  guest_id?: number;
};

export type SocialLoginResult = {
  token: string | null;
  is_phone_verified: number;
  is_email_verified: number;
  is_personal_info: number;
  is_exist_user: { id: string; name: string; image: string | null } | null;
  login_type: 'social';
  email: string | null;
};

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

async function generateReferralCode(f_name: string, id: number): Promise<string> {
  const crypto = await import('crypto');
  let code = `${f_name.substring(0, 3).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}${id}`;
  let exists = await prisma.users.findFirst({ where: { ref_code: code } });
  while (exists) {
    code = `${f_name.substring(0, 3).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}${id}`;
    exists = await prisma.users.findFirst({ where: { ref_code: code } });
  }
  return code;
}

async function ensureReferCode(userId: bigint, f_name: string | null): Promise<void> {
  const user = await prisma.users.findUnique({ where: { id: userId } });
  if (user?.ref_code) return;
  const refCode = await generateReferralCode(f_name || 'USR', Number(userId));
  await prisma.users.update({
    where: { id: userId },
    data: { ref_code: refCode },
  });
}

async function mergeGuestCart(userId: number, guestId: number): Promise<void> {
  if (!guestId || !userId) return;

  const guestCartItems = await prisma.carts.findMany({ where: { user_id: guestId } });
  if (guestCartItems.length === 0) return;

  const itemIds = guestCartItems.map((c) => Number(c.item_id));
  const foodItems = await prisma.food.findMany({
    where: { id: { in: itemIds.map((id) => BigInt(id)) } },
    select: { id: true, restaurant_id: true },
  });

  const guestStoreIds = foodItems.map((f) => Number(f.restaurant_id)).filter((id) => !Number.isNaN(id));
  if (guestStoreIds.length === 0) return;

  const userCarts = await prisma.carts.findMany({ where: { user_id: userId } });
  const userCartItemIds = userCarts.map((c) => Number(c.item_id));
  const userFoods = await prisma.food.findMany({
    where: {
      id: { in: userCartItemIds.map((id) => BigInt(id)) },
      restaurant_id: { in: guestStoreIds },
    },
    select: { id: true },
  });

  const foodIdsToDelete = userFoods.map((f) => Number(f.id));
  if (foodIdsToDelete.length > 0) {
    await prisma.carts.deleteMany({
      where: { user_id: userId, item_id: { in: foodIdsToDelete } },
    });
  }

  await prisma.carts.updateMany({
    where: { user_id: guestId },
    data: { user_id: userId, is_guest: false },
  });
}

function issueJwt(user: { id: bigint; email: string | null; phone: string | null }): string {
  return jwt.sign(
    {
      id: user.id.toString(),
      email: user.email,
      phone: user.phone,
      role: 'customer',
    },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function existUserPayload(user: {
  id: bigint;
  f_name: string | null;
  l_name: string | null;
  image: string | null;
}) {
  const name = `${user.f_name ?? ''} ${user.l_name ?? ''}`.trim();
  return {
    id: user.id.toString(),
    name,
    image: user.image,
  };
}

/** Mirrors PHP `CustomerAuthController::social_login`. */
export async function processConsumerSocialLogin(
  profile: GoogleTokenProfile,
  request: SocialLoginRequest
): Promise<SocialLoginResult> {
  const verified = request.verified ?? 'default';
  let user = await prisma.users.findFirst({ where: { email: profile.email } });
  let is_exist_user: SocialLoginResult['is_exist_user'] = null;

  const googleProvedEmail =
    request.medium === 'google' &&
    profile.email_verified === true &&
    request.email === profile.email;

  const pk = profile.id ?? profile.kid ?? profile.sub;
  const returningGoogleUser =
    request.medium === 'google' &&
    user != null &&
    (user.login_medium === 'google' ||
      (pk != null && user.social_id != null && String(user.social_id) === String(pk)));

  if (
    user &&
    verified === 'default' &&
    !user.is_email_verified &&
    !googleProvedEmail &&
    !returningGoogleUser
  ) {
    is_exist_user = existUserPayload(user);
    return {
      token: null,
      is_phone_verified: 1,
      is_email_verified: 1,
      is_personal_info: user.f_name ? 1 : 0,
      is_exist_user,
      login_type: 'social',
      email: user.email,
    };
  }

  if ((user && verified === 'no') || (!user && verified === 'default')) {
    if (request.email !== profile.email) {
      throw Object.assign(new Error('Email does not match Google account.'), { statusCode: 403 });
    }

    if (request.medium !== 'apple') {
      if (!pk) {
        throw Object.assign(new Error('Invalid Google credentials.'), { statusCode: 403 });
      }

      if (user && verified === 'no') {
        await prisma.users.update({
          where: { id: user.id },
          data: { email: null, updated_at: new Date() },
        });
      }

      user = await prisma.users.create({
        data: {
          email: profile.email,
          login_medium: request.medium,
          temp_token: request.unique_id,
          social_id: String(pk),
          password: await bcrypt.hash(request.unique_id, 10),
          status: true,
          is_email_verified: false,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    }
  }

  if (!user) {
    throw Object.assign(new Error('User not found.'), { statusCode: 401 });
  }

  if (!user.status) {
    throw Object.assign(new Error('Your account is blocked'), { statusCode: 403 });
  }

  await ensureReferCode(user.id, user.f_name);

  user = await prisma.users.update({
    where: { id: user.id },
    data: {
      login_medium: request.medium,
      is_email_verified: true,
      ...(request.medium !== 'apple' && pk
        ? { social_id: String(pk), temp_token: request.unique_id }
        : {}),
      updated_at: new Date(),
    },
  });

  const is_personal_info = user.f_name ? 1 : 0;
  let token: string | null = null;
  if (is_personal_info === 1) {
    token = issueJwt(user);
    if (request.guest_id) {
      await mergeGuestCart(Number(user.id), request.guest_id);
    }
  }

  return {
    token,
    is_phone_verified: 1,
    is_email_verified: 1,
    is_personal_info,
    is_exist_user,
    login_type: 'social',
    email: user.email,
  };
}

export function isGoogleAccessTokenFlag(value: unknown): boolean {
  return value === 1 || value === true || value === '1';
}

export async function verifyGoogleToken(
  token: string,
  useAccessToken: boolean
): Promise<GoogleTokenProfile> {
  const url = useAccessToken
    ? `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(token)}`
    : `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw Object.assign(new Error('Invalid Google token.'), { statusCode: 403 });
  }

  const data = (await res.json()) as Record<string, string | undefined>;
  const email = data.email;
  if (!email) {
    throw Object.assign(new Error('Google account has no email.'), { statusCode: 403 });
  }

  const emailVerifiedRaw = data.email_verified;
  const email_verified =
    emailVerifiedRaw === 'true' ||
    emailVerifiedRaw === '1' ||
    (typeof emailVerifiedRaw === 'boolean' && emailVerifiedRaw);

  return {
    email,
    sub: data.sub,
    id: data.id,
    kid: data.kid,
    email_verified,
  };
}
