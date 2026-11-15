import { Request, Response } from 'express';
import prisma from '../../config/database';
import { sendApiError, joiFirstMessage, errorMessageFromUnknown } from '../../utils/apiErrorResponse';
import { parseZoneIdsFromRequest } from '../../utils/consumer/favouriteHelpers';
import {
  couponApplyQuerySchema,
  couponListQuerySchema,
  restaurantWiseCouponQuerySchema,
} from '../../schemas/consumer/Coupon';
import {
  calculateCouponDiscount,
  formatConsumerCoupon,
  validateCouponForUser,
} from '../../utils/consumer/couponHelpers';


/**
 * @Description Customer coupon list (PHP GET /api/v1/coupon/list)
 * @Route GET /api/consumer/coupon/list
 * @Access Consumer (registered)
 */
export const listCoupons = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = parseZoneIdsFromRequest(req);
  if (!zoneIds?.length) {
    return sendApiError(res, 403, 'Zone id is required');
  }

  const validated = couponListQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }

  return res.status(200).json({
    status: true,
    data: [],
    msg: 'Coupons are applied at checkout with a code you received separately',
  });
};


/**
 * @Description Validate & return coupon (PHP GET /api/v1/coupon/apply)
 * @Route GET /api/consumer/coupon/apply
 * @Access Consumer (registered)
 */
export const applyCoupon = async (req: Request, res: Response): Promise<any> => {
  const validated = couponApplyQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }

  const { code, restaurant_id: restaurantId, order_amount: orderAmount } = validated.value as {
    code: string;
    restaurant_id: number;
    order_amount?: number;
  };
  const userId = Number(req.user?.id);

  try {
    const coupon = await prisma.coupons.findFirst({
      where: { code: code.trim(), status: true },
    });
    if (!coupon) {
      return sendApiError(res, 404, 'Coupon not found');
    }

    const check = await validateCouponForUser(coupon, userId, restaurantId);
    if (!('ok' in check)) {
      return sendApiError(res, check.httpStatus, check.message);
    }

    const subtotal =
      orderAmount != null && Number.isFinite(Number(orderAmount)) ? Number(orderAmount) : 0;
    if (Number(coupon.min_purchase) > 0 && subtotal > 0 && subtotal < Number(coupon.min_purchase)) {
      return sendApiError(res, 403, 'Minimum purchase not met for coupon');
    }

    const preview = subtotal > 0 ? calculateCouponDiscount(coupon, subtotal) : null;
    return res.status(200).json({
      status: true,
      data: {
        ...formatConsumerCoupon(coupon),
        coupon_discount_amount: preview,
      },
    });
  } catch (e: unknown) {
    return sendApiError(res, 403, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Public coupons for a restaurant (PHP GET /api/v1/coupon/restaurant-wise-coupon)
 * @Route GET /api/consumer/coupon/restaurant-wise
 * @Access Public (zone required)
 */
export const restaurantWiseCoupons = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = parseZoneIdsFromRequest(req);
  if (!zoneIds?.length) {
    return sendApiError(res, 403, 'Zone id is required');
  }

  const validated = restaurantWiseCouponQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error, 'Restaurant id is required'));
  }

  return res.status(200).json({
    status: true,
    data: [],
    msg: 'Coupons are applied at checkout with a code you received separately',
  });
};
