import { Request, Response } from 'express';
import prisma from '../../config/database';
import { sendApiError, errorMessageFromUnknown } from '../../utils/apiErrorResponse';
import { requireZoneIds } from '../../utils/consumer/zoneHeaders';
import { parseCoordinatesFromRequest } from '../../utils/consumer/favouriteHelpers';
import {
  applyDiscoverTypeFilter,
  DISCOVER_RESTAURANT_SELECT,
  distanceKmForRestaurant,
  availabilityMapForRestaurants,
  formatDiscoverRestaurant,
  loadActiveDiscountRestaurantIds,
  parseDiscoverType,
} from '../../utils/consumer/restaurantDiscoverHelpers';
import { formatRestaurantMenuFood } from '../../utils/consumer/restaurantMenuHelpers';
import { paginationSkip } from '../../utils/consumer/orderListHelpers';
import {
  filterCouponsForCustomerList,
  loadCouponsForRestaurantFilter,
} from '../../utils/consumer/couponHelpers';
import { parseZoneIdsFromRequest } from '../../utils/consumer/favouriteHelpers';

async function attachTopFoods(
  restaurants: Array<{ id: bigint }>,
  take = 5
) {
  const ids = restaurants.map((r) => Number(r.id));
  if (!ids.length) return new Map<number, ReturnType<typeof formatRestaurantMenuFood>[]>();
  const foods = await prisma.food.findMany({
    where: { restaurant_id: { in: ids }, status: true },
    orderBy: { order_count: 'desc' },
  });
  const map = new Map<number, ReturnType<typeof formatRestaurantMenuFood>[]>();
  for (const food of foods) {
    const rid = Number(food.restaurant_id);
    const list = map.get(rid) ?? [];
    if (list.length < take) list.push(formatRestaurantMenuFood(food));
    map.set(rid, list);
  }
  return map;
}

/**
 * @Description Search restaurants by name (PHP GET /api/v1/restaurants/search)
 * @Route GET /api/consumer/restaurants/search
 * @Access Public
 */
export const searchRestaurants = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;
  const name = String(req.query.name ?? '').trim();
  if (!name) return sendApiError(res, 403, 'name is required');

  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  const offset = Math.max(Number(req.query.offset ?? req.query.page) || 1, 1);
  const type = parseDiscoverType(req.query.type);
  const coords = parseCoordinatesFromRequest(req);
  const dineIn = req.query.dine_in === '1' || req.query.dine_in === 'true';
  const topRated = req.query.top_rated === '1' || req.query.top_rated === 'true';
  const discounted =
    req.query.discounted === '1' ||
    req.query.discounted === 'true' ||
    req.query.discount === '1' ||
    req.query.discount === 'true';

  const where: Record<string, unknown> = {
    status: true,
    zone_id: { in: zoneIds },
    name: { contains: name, mode: 'insensitive' },
  };
  applyDiscoverTypeFilter(where, type);
  if (req.query.veg === '1' || req.query.veg === 'true') where.veg = true;
  if (req.query.non_veg === '1' || req.query.non_veg === 'true') where.non_veg = true;

  try {
    if (discounted) {
      const discountedIds = await loadActiveDiscountRestaurantIds();
      where.id = { in: discountedIds };
    }

    if (dineIn) {
      const dineInConfigs = await prisma.restaurant_configs.findMany({
        where: { dine_in: true },
        select: { restaurant_id: true },
      });
      const dineInIds = dineInConfigs.map((c) => Number(c.restaurant_id));
      const existingIn = (where.id as any)?.in as bigint[] | undefined;
      const dineInBigInts = dineInIds.map((id) => BigInt(id));
      if (existingIn) {
        where.id = { in: existingIn.filter((id) => dineInBigInts.includes(id)) };
      } else {
        where.id = { in: dineInBigInts };
      }
    }

    const [total_size, rows] = await Promise.all([
      prisma.restaurants.count({ where }),
      prisma.restaurants.findMany({
        where,
        select: DISCOVER_RESTAURANT_SELECT,
        skip: paginationSkip(limit, offset),
        take: limit,
        orderBy:
          req.query.sort_by === 'rating' || topRated
            ? [{ rating: 'desc' }, { id: 'desc' }]
            : req.query.new === '1'
              ? [{ created_at: 'desc' }]
              : [{ order_count: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const availabilityMap = await availabilityMapForRestaurants(rows);
    return res.status(200).json({
      status: true,
      total_size,
      limit,
      offset,
      restaurants: rows.map((row) =>
        formatDiscoverRestaurant(row, {
          availability: availabilityMap.get(row.id.toString()) ?? undefined,
          distanceKm: distanceKmForRestaurant(coords, row.latitude, row.longitude),
        })
      ),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Dine-in restaurants (PHP GET /api/v1/restaurants/dine-in)
 * @Route GET /api/consumer/restaurants/dine-in
 * @Access Public
 */
export const getDineInRestaurants = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
  const offset = Math.max(Number(req.query.offset ?? req.query.page) || 1, 1);
  const type = parseDiscoverType(req.query.type);
  const coords = parseCoordinatesFromRequest(req);

  try {
    const configs = await prisma.restaurant_configs.findMany({
      where: { dine_in: true },
      select: { restaurant_id: true },
    });
    const ids = configs.map((c) => Number(c.restaurant_id)).filter((n) => Number.isFinite(n));
    const where: Record<string, unknown> = {
      id: { in: ids.map((id) => BigInt(id)) },
      status: true,
      zone_id: { in: zoneIds },
    };
    applyDiscoverTypeFilter(where, type);
    if (req.query.veg === '1' || req.query.veg === 'true') where.veg = true;
    if (req.query.non_veg === '1' || req.query.non_veg === 'true') where.non_veg = true;

    const [total_size, rows] = await Promise.all([
      prisma.restaurants.count({ where }),
      prisma.restaurants.findMany({
        where,
        select: DISCOVER_RESTAURANT_SELECT,
        skip: paginationSkip(limit, offset),
        take: limit,
        orderBy: [{ order_count: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const availabilityMap = await availabilityMapForRestaurants(rows);
    return res.status(200).json({
      status: true,
      total_size,
      limit,
      offset,
      restaurants: rows.map((row) =>
        formatDiscoverRestaurant(row, {
          availability: availabilityMap.get(row.id.toString()) ?? undefined,
          distanceKm: distanceKmForRestaurant(coords, row.latitude, row.longitude),
        })
      ),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Recently viewed restaurants (PHP GET /api/v1/restaurants/recently-viewed-restaurants)
 * @Route GET /api/consumer/restaurants/recently-viewed
 * @Access Consumer
 */
export const getRecentlyViewedRestaurants = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;
  const userId = Number(req.user?.id);
  if (!userId) return sendApiError(res, 401, 'Unauthorized');
  const coords = parseCoordinatesFromRequest(req);
  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);

  try {
    const logs = await prisma.visitor_logs.findMany({
      where: {
        user_id: userId,
        visitor_log_type: 'App\\Models\\Restaurant',
      },
      orderBy: { updated_at: 'desc' },
      take: 50,
    });
    const ids = logs.map((l) => Number(l.visitor_log_id)).filter((n) => Number.isFinite(n));
    const rows = await prisma.restaurants.findMany({
      where: {
        id: { in: ids.map((id) => BigInt(id)) },
        status: true,
        zone_id: { in: zoneIds },
      },
      select: DISCOVER_RESTAURANT_SELECT,
      take: limit,
    });
    const availabilityMap = await availabilityMapForRestaurants(rows);
    return res.status(200).json({
      status: true,
      data: rows.map((row) =>
        formatDiscoverRestaurant(row, {
          availability: availabilityMap.get(row.id.toString()) ?? undefined,
          distanceKm: distanceKmForRestaurant(coords, row.latitude, row.longitude),
        })
      ),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Suggested restaurants with sample foods (PHP GET /api/v1/restaurants/recommended)
 * @Route GET /api/consumer/restaurants/recommended
 * @Access Public
 */
export const getRecommendedRestaurants = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;
  const coords = parseCoordinatesFromRequest(req);
  try {
    const rows = await prisma.restaurants.findMany({
      where: { status: true, zone_id: { in: zoneIds } },
      select: DISCOVER_RESTAURANT_SELECT,
      take: 40,
      orderBy: [{ order_count: 'desc' }, { id: 'desc' }],
    });
    const shuffled = [...rows].sort(() => Math.random() - 0.5).slice(0, 20);
    const availabilityMap = await availabilityMapForRestaurants(shuffled);
    const foods = await attachTopFoods(shuffled, 5);
    return res.status(200).json({
      status: true,
      data: shuffled.map((row) => ({
        ...formatDiscoverRestaurant(row, {
          availability: availabilityMap.get(row.id.toString()) ?? undefined,
          distanceKm: distanceKmForRestaurant(coords, row.latitude, row.longitude),
        }),
        foods: foods.get(Number(row.id)) ?? [],
      })),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Restaurants this customer has visited before (PHP GET /api/v1/restaurants/visit-again)
 * @Route GET /api/consumer/restaurants/visit-again
 * @Access Consumer
 */
export const getVisitedRestaurants = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;
  const userId = Number(req.user?.id);
  if (!userId) return sendApiError(res, 401, 'Unauthorized');
  const coords = parseCoordinatesFromRequest(req);

  try {
    const logs = await prisma.visitor_logs.findMany({
      where: {
        user_id: userId,
        visitor_log_type: 'App\\Models\\Restaurant',
      },
      orderBy: { visit_count: 'desc' },
      take: 40,
    });
    const ids = logs.map((l) => Number(l.visitor_log_id)).filter((n) => Number.isFinite(n));
    const rows = await prisma.restaurants.findMany({
      where: {
        id: { in: ids.map((id) => BigInt(id)) },
        status: true,
        zone_id: { in: zoneIds },
      },
      select: DISCOVER_RESTAURANT_SELECT,
      take: 20,
    });
    const availabilityMap = await availabilityMapForRestaurants(rows);
    const foods = await attachTopFoods(rows, 5);
    return res.status(200).json({
      status: true,
      data: rows.map((row) => ({
        ...formatDiscoverRestaurant(row, {
          availability: availabilityMap.get(row.id.toString()) ?? undefined,
          distanceKm: distanceKmForRestaurant(coords, row.latitude, row.longitude),
        }),
        foods: foods.get(Number(row.id)) ?? [],
      })),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Coupons for a restaurant details screen (PHP GET /api/v1/restaurants/get-coupon)
 * @Route GET /api/consumer/restaurants/coupons
 * @Access Public
 */
export const getRestaurantCoupons = async (req: Request, res: Response): Promise<any> => {
  const restaurantId = Number(req.query.restaurant_id);
  if (!Number.isFinite(restaurantId) || restaurantId <= 0) {
    return sendApiError(res, 403, 'restaurant_id is required');
  }
  const zoneIds = parseZoneIdsFromRequest(req) ?? [];
  const customerId = req.user?.id ? Number(req.user.id) : Number(req.query.customer_id) || null;
  try {
    const rows = await loadCouponsForRestaurantFilter(restaurantId);
    const data = await filterCouponsForCustomerList({
      coupons: rows,
      zoneIds: zoneIds.length ? zoneIds : [0],
      customerId,
      restaurantId,
    });
    return res.status(200).json({ status: true, data });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};
