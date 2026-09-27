import { Request, Response } from 'express';
import prisma from '../../config/database';
import {
  firebaseTokenSchema,
  updateInterestSchema,
  updateProfileSchema,
} from '../../schemas/consumer/profile';
import { parseZoneIdsFromRequest } from '../../utils/consumer/favouriteHelpers';
import {
  formatProfileUser,
  formatUserinfo,
  loadUserInfo,
  ONGOING_ORDER_STATUSES,
  parseInterestCategoryIds,
  persistUserZoneId,
} from '../../utils/consumer/profileHelpers';

function requireUserId(req: Request, res: Response): number | null {
  const userId = Number(req.user?.id);
  if (!userId) {
    res.status(401).json({ status: false, msg: 'Unauthorized' });
    return null;
  }
  return userId;
}

/**
 * @Description Customer profile (legacy GET /customer/info)
 * @Route GET /api/consumer/whoami
 * @Access Private
 */
export const getProfile = async (req: Request, res: Response): Promise<any> => {
  const userId = requireUserId(req, res);
  if (userId == null) return;

  try {
    const user = await prisma.users.findUnique({ where: { id: BigInt(userId) } });
    if (!user) {
      return res.status(404).json({
        status: false,
        msg: 'User not found'
      });
    }

    const [orderCount, userinfo] = await Promise.all([
      prisma.orders.count({
        where: { user_id: userId, is_guest: false },
      }),
      loadUserInfo(userId),
    ]);

    const memberSinceDays = user.created_at
      ? Math.floor((Date.now() - user.created_at.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return res.status(200).json({
      status: true,
      msg: 'Success',
      data: {
        ...formatProfileUser(user),
        userinfo: formatUserinfo(userinfo),
        order_count: orderCount,
        member_since_days: memberSinceDays,
        is_valid_for_discount: orderCount === 0,
        discount_amount: 0,
        discount_amount_type: '',
        validity: '',
      },
    });
  } catch (e: any) {
    return res.status(500).json({ 
      status: false
      , msg: e.message });
  }
};


/**
 * @Description Update profile (legacy POST /customer/update-profile, MVP without OTP)
 * @Route PUT /api/consumer/update-profile
 * @Access Private
 */
export const updateProfile = async (req: Request, res: Response): Promise<any> => {
  const userId = requireUserId(req, res);
  if (userId == null) return;

  const validated = updateProfileSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const body = validated.value as {
    name?: string;
    f_name?: string;
    l_name?: string;
    email?: string | null;
    phone?: string | null;
    image?: string | null;
    current_language_key?: string;
    zone_id?: number;
  };

  const data: Record<string, unknown> = { updated_at: new Date() };

  const touchesName =
    body.name !== undefined || body.f_name !== undefined || body.l_name !== undefined;
  if (touchesName) {
    let fName = body.f_name;
    let lName = body.l_name ?? '';
    if (body.name) {
      const parts = body.name.trim().split(/\s+/);
      fName = parts[0];
      lName = parts.slice(1).join(' ') || '';
    }
    if (!fName?.trim()) {
      return res.status(400).json({ status: false, msg: 'Name is required' });
    }
    data.f_name = fName.trim();
    data.l_name = lName.trim();
  }

  if (body.current_language_key !== undefined) {
    data.current_language_key = body.current_language_key.trim();
  }
  if (body.zone_id !== undefined) {
    data.zone_id = body.zone_id;
  }

  try {
    const user = await prisma.users.findUnique({ where: { id: BigInt(userId) } });
    if (!user) {
      return res.status(404).json({ status: false, msg: 'User not found' });
    }

    if (body.email && body.email !== user.email) {
      const emailTaken = await prisma.users.findFirst({
        where: { email: body.email, NOT: { id: BigInt(userId) } },
      });
      if (emailTaken) {
        return res.status(403).json({ status: false, msg: 'Email is already taken' });
      }
    }

    if (body.phone && body.phone !== user.phone) {
      const phoneTaken = await prisma.users.findFirst({
        where: { phone: body.phone, NOT: { id: BigInt(userId) } },
      });
      if (phoneTaken) {
        return res.status(403).json({ status: false, msg: 'Phone is already taken' });
      }
    }

    if (body.email !== undefined) data.email = body.email || null;
    if (body.phone !== undefined) data.phone = body.phone || null;
    if (body.image !== undefined) data.image = body.image || null;

    if (body.email && body.email !== user.email) {
      data.is_email_verified = false;
    }
    if (body.phone && body.phone !== user.phone) {
      data.is_phone_verified = false;
    }

    const updated = await prisma.users.update({
      where: { id: BigInt(userId) },
      data: data as any,
    });

    const userinfo = await loadUserInfo(userId);
    if (userinfo) {
      await prisma.user_infos.update({
        where: { id: userinfo.id },
        data: {
          f_name: updated.f_name,
          l_name: updated.l_name,
          email: updated.email,
          phone: updated.phone,
          image: updated.image,
          updated_at: new Date(),
        },
      });
    }

    return res.status(200).json({
      status: true,
      msg: 'Profile successfully updated',
      data: formatProfileUser(updated),
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};


/**
 * @Description FCM token (legacy PUT /customer/cm-firebase-token)
 * @Route PUT /api/consumer/update-firebase-token
 */
export const updateFirebaseToken = async (req: Request, res: Response): Promise<any> => {
  const userId = requireUserId(req, res);
  if (userId == null) return;

  const validated = firebaseTokenSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const { cm_firebase_token } = validated.value as { cm_firebase_token: string };

  try {
    await prisma.users.update({
      where: { id: BigInt(userId) },
      data: { cm_firebase_token, updated_at: new Date() },
    });
    return res.status(200).json({
      status: true,
      msg: 'Updated successfully',
    });
  } catch (e: any) {
    return res.status(500).json({
      status: false,
      msg: e.message,
    });
  }
};


/**
 * @Description Persist zone from header (legacy GET /customer/update-zone)
 * @Route PUT /api/consumer/update-zone
 * @Query zone_id — e.g. `2` (or body `{ "zone_id": 2 }`)
 */
export const updateProfileZone = async (req: Request, res: Response): Promise<any> => {
  const userId = requireUserId(req, res);
  if (userId == null) return;

  const zoneIds = parseZoneIdsFromRequest(req);
  if (!zoneIds?.length) {
    return res.status(403).json({
      status: false,
      msg: 'Zone id is required!',
    });
  }

  try {
    await persistUserZoneId(userId, zoneIds[0]);
    return res.status(200).json({
      status: true,
      msg: 'Success',
      data: { zone_id: zoneIds[0] },
    });
  } catch (e: any) {
    return res.status(500).json({
      status: false,
      msg: e.message,
    });
  }
};


/**
 * @Description Food preferences (legacy POST /customer/update-interest)
 * @Route POST /api/consumer/update-interest
 */
export const updateInterest = async (req: Request, res: Response): Promise<any> => {
  const userId = requireUserId(req, res);
  if (userId == null) return;

  const validated = updateInterestSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const { interest } = validated.value as { interest: number[] };

  try {
    await prisma.users.update({
      where: { id: BigInt(userId) },
      data: { interest: JSON.stringify(interest), updated_at: new Date() },
    });
    return res.status(200).json({ status: true, msg: 'Interest updated successfully' });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};


/**
 * @Description Delete account (legacy DELETE /customer/remove-account)
 * @Route DELETE /api/consumer/delete-account
 */
export const removeAccount = async (req: Request, res: Response): Promise<any> => {
  const userId = requireUserId(req, res);
  if (userId == null) return;

  try {
    const ongoing = await prisma.orders.count({
      where: {
        user_id: userId,
        is_guest: false,
        order_status: { in: [...ONGOING_ORDER_STATUSES] },
      },
    });

    if (ongoing > 0) {
      return res.status(403).json({
        status: false,
        msg: 'You have ongoing orders. Complete or cancel them before deleting your account.',
      });
    }

    await prisma.carts.deleteMany({ where: { user_id: userId, is_guest: false } });
    await prisma.wishlists.deleteMany({ where: { user_id: userId } });
    await prisma.customer_addresses.deleteMany({ where: { user_id: userId } });
    await prisma.user_infos.deleteMany({ where: { user_id: userId } });
    await prisma.users.delete({ where: { id: BigInt(userId) } });

    return res.status(200).json({ status: true, msg: 'Account removed', data: {} });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};


/**
 * @Description Personalized foods (legacy GET /customer/suggested-foods)
 * @Route GET /api/consumer/suggested-foods
 * @Query zone_id — required (e.g. `?zone_id=2`)
 */
export const getSuggestedFoods = async (req: Request, res: Response): Promise<any> => {
  const userId = requireUserId(req, res);
  if (userId == null) return;

  const zoneIds = parseZoneIdsFromRequest(req);
  if (!zoneIds?.length) {
    return res.status(403).json({ status: false, msg: 'Zone id is required!' });
  }

  try {
    const user = await prisma.users.findUnique({
      where: { id: BigInt(userId) },
      select: { interest: true },
    });

    const categoryIds = parseInterestCategoryIds(user?.interest);

    const zoneRestaurants = await prisma.restaurants.findMany({
      where: { status: true, zone_id: { in: zoneIds } },
      select: { id: true },
    });
    const restaurantIds = zoneRestaurants.map((r) => Number(r.id));
    if (!restaurantIds.length) {
      return res.status(200).json({ status: true, msg: 'Success', data: [] });
    }

    const foods = await prisma.food.findMany({
      where: {
        status: true,
        restaurant_id: { in: restaurantIds },
        ...(categoryIds?.length ? { category_id: { in: categoryIds } } : {}),
      },
      take: 5,
      orderBy: categoryIds?.length ? { id: 'desc' } : { order_count: 'desc' },
      select: {
        id: true,
        name: true,
        image: true,
        price: true,
        discount: true,
        veg: true,
        restaurant_id: true,
      },
    });

    const data = foods.map((f) => ({
      id: f.id.toString(),
      name: f.name,
      image: f.image,
      price: Number(f.price),
      discount: Number(f.discount),
      veg: f.veg,
      restaurant_id: f.restaurant_id?.toString() ?? null,
    }));

    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};
