import { coupons, Prisma } from '@prisma/client';
import prisma from '../../config/database';

export type CouponValidationResult =
  | { ok: true }
  | { httpStatus: number; code: string; message: string };

export function parseJsonIdList(raw: string | null | undefined): number[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => Number(v)).filter((n) => Number.isFinite(n));
  } catch {
    return [];
  }
}

export function parseCouponCustomerIds(raw: string | null | undefined): Array<string | number> {
  if (!raw?.trim()) return ['all'];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : ['all'];
  } catch {
    return ['all'];
  }
}

export function customerEligibleForCoupon(
  customerIds: Array<string | number>,
  userId: number | null
): boolean {
  if (customerIds.some((id) => String(id) === 'all')) return true;
  if (userId == null) return false;
  return customerIds.some((id) => Number(id) === userId);
}

export function couponDatesValid(coupon: coupons, today = new Date()): boolean {
  const day = today.toISOString().slice(0, 10);
  const start = coupon.start_date?.toISOString().slice(0, 10);
  const expire = coupon.expire_date?.toISOString().slice(0, 10);
  if (start && start > day) return false;
  if (expire && expire < day) return false;
  return true;
}

export function activeCouponWhere(extra?: Prisma.couponsWhereInput): Prisma.couponsWhereInput {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setHours(23, 59, 59, 999);
  return {
    status: true,
    start_date: { lte: end },
    expire_date: { gte: today },
    ...extra,
  };
}

/** PHP CouponLogic::is_valide — status codes 200, 404, 406, 407, 408 */
export async function validateCouponForUser(
  coupon: coupons,
  userId: number,
  restaurantId: number
): Promise<CouponValidationResult> {
  if (!couponDatesValid(coupon)) {
    return { httpStatus: 407, code: 'coupon', message: 'Coupon expired' };
  }

  const customerIds = parseCouponCustomerIds(coupon.customer_id);
  if (!customerEligibleForCoupon(customerIds, userId)) {
    return {
      httpStatus: 403,
      code: 'coupon',
      message: 'You are not eligible for this coupon',
    };
  }

  if (coupon.coupon_type === 'restaurant_wise') {
    const ids = parseJsonIdList(coupon.data);
    if (!ids.includes(restaurantId)) {
      return { httpStatus: 404, code: 'coupon', message: 'Not found' };
    }
  }

  if (coupon.created_by === 'vendor' && Number(coupon.restaurant_id) !== restaurantId) {
    return { httpStatus: 404, code: 'coupon', message: 'Not found' };
  }

  if (coupon.coupon_type === 'zone_wise') {
    const zoneIds = parseJsonIdList(coupon.data);
    if (!zoneIds.length) {
      return { httpStatus: 404, code: 'coupon', message: 'Not found' };
    }
    const restaurant = await prisma.restaurants.findFirst({
      where: { id: BigInt(restaurantId), zone_id: { in: zoneIds.map((z) => z) } },
      select: { id: true },
    });
    if (!restaurant) {
      return { httpStatus: 404, code: 'coupon', message: 'Not found' };
    }
  }

  if (coupon.coupon_type === 'first_order') {
    const totalOrders = await prisma.orders.count({
      where: { user_id: userId, ...notPosWhere },
    });
    const limit = coupon.limit != null ? Number(coupon.limit) : 0;
    if (totalOrders >= limit) {
      return { httpStatus: 406, code: 'coupon', message: 'Coupon usage limit over' };
    }
    return { ok: true };
  }

  if (coupon.limit == null) {
    return { ok: true };
  }

  const uses = await prisma.orders.count({
    where: {
      user_id: userId,
      coupon_code: coupon.code ?? undefined,
    },
  });
  if (uses < Number(coupon.limit)) {
    return { ok: true };
  }
  return { httpStatus: 406, code: 'coupon', message: 'Coupon usage limit over' };
}

const notPosWhere: Prisma.ordersWhereInput = { order_type: { not: 'pos' } };

export function calculateCouponDiscount(coupon: coupons, orderAmount: number): number {
  let discount = 0;
  const type = coupon.discount_type?.toLowerCase();
  if ((type === 'percent' || type === 'percentage') && Number(coupon.discount) > 0) {
    discount = orderAmount * (Number(coupon.discount) / 100);
  } else {
    discount = Number(coupon.discount);
  }
  if (Number(coupon.max_discount) > 0) {
    discount = Math.min(discount, Number(coupon.max_discount));
  }
  return Math.round(discount * 100) / 100;
}

export function formatConsumerCoupon(
  coupon: coupons,
  options?: { restaurantName?: string | null; dataLabel?: string | null }
): Record<string, unknown> {
  return {
    id: Number(coupon.id),
    title: coupon.title,
    code: coupon.code,
    start_date: coupon.start_date,
    expire_date: coupon.expire_date,
    min_purchase: Number(coupon.min_purchase),
    max_discount: Number(coupon.max_discount),
    discount: Number(coupon.discount),
    discount_type: coupon.discount_type,
    coupon_type: coupon.coupon_type,
    limit: coupon.limit != null ? Number(coupon.limit) : null,
    status: coupon.status,
    data: options?.dataLabel ?? coupon.data,
    total_uses: coupon.total_uses != null ? Number(coupon.total_uses) : 0,
    created_by: coupon.created_by,
    customer_id: coupon.customer_id,
    slug: coupon.slug,
    restaurant_id: coupon.restaurant_id != null ? Number(coupon.restaurant_id) : null,
    restaurant: options?.restaurantName
      ? { id: Number(coupon.restaurant_id ?? 0), name: options.restaurantName }
      : undefined,
    created_at: coupon.created_at,
    updated_at: coupon.updated_at,
  };
}

async function restaurantActiveInZones(restaurantId: number, zoneIds: number[]): Promise<boolean> {
  const row = await prisma.restaurants.findFirst({
    where: {
      id: BigInt(restaurantId),
      status: true,
      zone_id: { in: zoneIds },
    },
    select: { id: true },
  });
  return Boolean(row);
}

/** PHP CouponController::list filtering loop */
export async function filterCouponsForCustomerList(params: {
  coupons: coupons[];
  zoneIds: number[];
  customerId: number | null;
  restaurantId?: number;
  /** PHP restaurant_wise_coupon — only coupons where customer_id includes "all" */
  publicRestaurantCoupons?: boolean;
}): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];

  for (const coupon of params.coupons) {
    const customerIds = parseCouponCustomerIds(coupon.customer_id);
    const eligible = params.publicRestaurantCoupons
      ? customerIds.some((id) => String(id) === 'all')
      : customerEligibleForCoupon(customerIds, params.customerId);

    if (coupon.coupon_type === 'restaurant_wise') {
      const ids = parseJsonIdList(coupon.data);
      const temp = await prisma.restaurants.findFirst({
        where: { id: { in: ids.map((id) => BigInt(id)) }, status: true, zone_id: { in: params.zoneIds } },
        select: { id: true, name: true },
      });
      if (temp && eligible) {
        out.push(formatConsumerCoupon(coupon, { dataLabel: temp.name }));
      }
      continue;
    }

    if (coupon.coupon_type === 'zone_wise') {
      const couponZones = parseJsonIdList(coupon.data);
      if (params.zoneIds.some((z) => couponZones.includes(z)) && eligible) {
        out.push(formatConsumerCoupon(coupon));
      }
      continue;
    }

    if (coupon.restaurant_id != null) {
      const exists = await prisma.restaurants.findFirst({
        where: { id: BigInt(Number(coupon.restaurant_id)), status: true },
        select: { id: true, name: true },
      });
      if (exists) {
        out.push(formatConsumerCoupon(coupon, { restaurantName: exists.name }));
      }
      continue;
    }

    if (eligible) {
      out.push(formatConsumerCoupon(coupon));
    }
  }

  return out;
}

export async function loadCouponsForRestaurantFilter(restaurantId?: number) {
  if (restaurantId == null) {
    return prisma.coupons.findMany({ where: activeCouponWhere() });
  }
  return prisma.coupons.findMany({
    where: activeCouponWhere({
      OR: [
        { restaurant_id: restaurantId },
        {
          coupon_type: 'restaurant_wise',
          data: { contains: String(restaurantId) },
        },
      ],
    }),
  });
}

export { restaurantActiveInZones };
