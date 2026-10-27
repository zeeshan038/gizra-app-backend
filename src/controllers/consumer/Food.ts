import { Request, Response } from 'express';
import prisma from '../../config/database';
import { sendApiError, errorMessageFromUnknown } from '../../utils/apiErrorResponse';
import { requireZoneIds } from '../../utils/consumer/zoneHeaders';
import { parseMenuFoodType, formatRestaurantMenuFood } from '../../utils/consumer/restaurantMenuHelpers';
import {
  buildZoneFoodWhere,
  paginateFoods,
  parseListPaging,
} from '../../utils/consumer/productListHelpers';
import { parseOptionalCategoryId } from '../../utils/consumer/restaurantMenuHelpers';
import { searchFoods } from './Restaurant';

export { searchFoods };

function minRatingFromQuery(query: Record<string, unknown>): number | undefined {
  if (query.rating_5 === '1' || query.rating_5 === 'true') return 5;
  if (query.rating_4_plus === '1' || query.rating_4_plus === 'true') return 4.01;
  if (query.rating_4 === '1' || query.rating_4 === 'true') return 4;
  if (query.rating_3_plus === '1' || query.rating_3_plus === 'true') return 3.01;
  if (query.rating_3 === '1' || query.rating_3 === 'true') return 3;
  return undefined;
}

/**
 * @Description Latest foods for a restaurant/category (PHP GET /api/v1/products/latest)
 * @Route GET /api/consumer/foods/latest
 * @Access Public
 */
export const getLatestFoods = async (req: Request, res: Response): Promise<any> => {
  const restaurantId = Number(req.query.restaurant_id);
  const categoryId = parseOptionalCategoryId(req.query.category_id);
  if (!Number.isFinite(restaurantId) || restaurantId <= 0) {
    return sendApiError(res, 403, 'restaurant_id is required');
  }
  const { limit, page } = parseListPaging(req.query as Record<string, unknown>);
  try {
    const where = await buildZoneFoodWhere({
      restaurantId,
      categoryId,
      type: parseMenuFoodType(req.query.type),
    });
    const data = await paginateFoods({
      where,
      orderBy: { created_at: 'desc' },
      limit,
      page,
    });
    return res.status(200).json({ status: true, ...data });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Popular foods in the customer zone (PHP GET /api/v1/products/popular)
 * @Route GET /api/consumer/foods/popular
 * @Access Public
 */
export const getPopularFoods = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;
  const { limit, page } = parseListPaging(req.query as Record<string, unknown>);
  try {
    const where = await buildZoneFoodWhere({
      zoneIds,
      type: parseMenuFoodType(req.query.type),
    });
    const data = await paginateFoods({
      where,
      orderBy: [{ order_count: 'desc' }, { id: 'desc' }],
      limit,
      page,
    });
    return res.status(200).json({ status: true, ...data });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Most-reviewed foods in the customer zone (PHP GET /api/v1/products/most-reviewed)
 * @Route GET /api/consumer/foods/most-reviewed
 * @Access Public
 */
export const getMostReviewedFoods = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;
  const { limit, page } = parseListPaging(req.query as Record<string, unknown>);
  try {
    const where = await buildZoneFoodWhere({
      zoneIds,
      type: parseMenuFoodType(req.query.type),
    });
    const data = await paginateFoods({
      where,
      orderBy: [{ rating_count: 'desc' }, { avg_rating: 'desc' }],
      limit,
      page,
    });
    return res.status(200).json({ status: true, ...data });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Recommended foods for a restaurant (PHP GET /api/v1/products/recommended)
 * @Route GET /api/consumer/foods/recommended
 * @Access Public
 */
export const getRecommendedFoods = async (req: Request, res: Response): Promise<any> => {
  const restaurantId = Number(req.query.restaurant_id);
  if (!Number.isFinite(restaurantId) || restaurantId <= 0) {
    return sendApiError(res, 403, 'restaurant_id is required');
  }
  const { limit, page } = parseListPaging(req.query as Record<string, unknown>);
  try {
    const where = await buildZoneFoodWhere({
      restaurantId,
      name: (req.query.name as string) ?? undefined,
      type: parseMenuFoodType(req.query.type),
      recommendedOnly: true,
    });
    const data = await paginateFoods({
      where,
      orderBy: [{ order_count: 'desc' }, { id: 'desc' }],
      limit,
      page,
    });
    return res.status(200).json({ status: true, ...data });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Popular foods for one restaurant (PHP GET /api/v1/products/restaurant-popular-products)
 * @Route GET /api/consumer/foods/restaurant-popular
 * @Access Public
 */
export const getRestaurantPopularFoods = async (req: Request, res: Response): Promise<any> => {
  const restaurantId = Number(req.query.restaurant_id);
  if (!Number.isFinite(restaurantId) || restaurantId <= 0) {
    return sendApiError(res, 403, 'restaurant_id is required');
  }
  const { limit, page } = parseListPaging(req.query as Record<string, unknown>, 20);
  try {
    const where = await buildZoneFoodWhere({
      restaurantId,
      type: parseMenuFoodType(req.query.type),
    });
    const data = await paginateFoods({
      where,
      orderBy: [{ order_count: 'desc' }, { avg_rating: 'desc' }],
      limit,
      page,
    });
    return res.status(200).json({ status: true, ...data });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Set-menu / featured items (PHP GET /api/v1/products/set-menu). Schema has no set_menu column — uses recommended foods.
 * @Route GET /api/consumer/foods/set-menu
 * @Access Public
 */
export const getSetMenuFoods = async (req: Request, res: Response): Promise<any> => {
  try {
    const where = await buildZoneFoodWhere({ recommendedOnly: true });
    const data = await paginateFoods({
      where,
      orderBy: [{ order_count: 'desc' }, { id: 'desc' }],
      limit: 50,
      page: 1,
    });
    return res.status(200).json({ status: true, data: data.products });
  } catch (e: unknown) {
    return sendApiError(res, 404, errorMessageFromUnknown(e, 'Set menu not found!'));
  }
};

/**
 * @Description Related foods in the same category (PHP GET /api/v1/products/related-products/{food_id})
 * @Route GET /api/consumer/foods/related/:food_id
 * @Access Public
 */
export const getRelatedFoods = async (req: Request, res: Response): Promise<any> => {
  const foodId = Number(req.params.food_id);
  if (!Number.isFinite(foodId) || foodId <= 0) {
    return sendApiError(res, 400, 'Invalid food_id');
  }
  try {
    const food = await prisma.food.findUnique({
      where: { id: BigInt(foodId) },
      select: { category_id: true, restaurant_id: true },
    });
    if (!food) return sendApiError(res, 404, 'Food not found');
    const where = await buildZoneFoodWhere({
      restaurantId: food.restaurant_id != null ? Number(food.restaurant_id) : undefined,
      categoryId: food.category_id != null ? Number(food.category_id) : undefined,
    });
    where.id = { not: BigInt(foodId) };
    const data = await paginateFoods({
      where,
      orderBy: [{ order_count: 'desc' }, { id: 'desc' }],
      limit: 20,
      page: 1,
    });
    return res.status(200).json({ status: true, data: data.products });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Single food details (PHP GET /api/v1/products/details/{id})
 * @Route GET /api/consumer/foods/details/:id
 * @Access Public
 */
export const getFoodDetails = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return sendApiError(res, 400, 'Invalid food id');
  }
  try {
    const food = await prisma.food.findFirst({
      where: { id: BigInt(id), status: true },
    });
    if (!food) return sendApiError(res, 404, 'Food not found');
    let restaurantName: string | null = null;
    if (food.restaurant_id != null) {
      const restaurant = await prisma.restaurants.findUnique({
        where: { id: BigInt(Number(food.restaurant_id)) },
        select: { name: true },
      });
      restaurantName = restaurant?.name ?? null;
    }
    const { buildAddonLookupFromFoodRows } = await import(
      '../../utils/vendor/catalog/foodAddonHelpers'
    );
    const addonLookup = await buildAddonLookupFromFoodRows([food]);
    return res.status(200).json({
      status: true,
      data: formatRestaurantMenuFood(food, { restaurant_name: restaurantName }, addonLookup),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Combined food search with extra PHP filters (PHP GET /api/v1/products/search)
 * @Route GET /api/consumer/foods/search
 * @Access Public
 */
export const searchFoodsWithFilters = async (req: Request, res: Response): Promise<any> => {
  const name = String(req.query.name ?? '').trim();
  if (!name) {
    return searchFoods(req, res);
  }
  const hasZone = Boolean(req.query.zone_id || req.headers.zoneid);
  const zoneIds = hasZone ? requireZoneIds(req, res) : null;
  if (hasZone && !zoneIds) return;
  const { limit, page } = parseListPaging(req.query as Record<string, unknown>);
  try {
    const where = await buildZoneFoodWhere({
      zoneIds: zoneIds ?? undefined,
      restaurantId: req.query.restaurant_id ? Number(req.query.restaurant_id) : undefined,
      categoryId: parseOptionalCategoryId(req.query.category_id),
      name,
      type: parseMenuFoodType(req.query.type),
      minPrice: req.query.min_price != null ? Number(req.query.min_price) : undefined,
      maxPrice: req.query.max_price != null ? Number(req.query.max_price) : undefined,
      minRating: minRatingFromQuery(req.query as Record<string, unknown>),
    });
    const orderBy =
      req.query.popular === '1'
        ? [{ order_count: 'desc' as const }]
        : req.query.new === '1'
          ? [{ created_at: 'desc' as const }]
          : [{ id: 'desc' as const }];
    const data = await paginateFoods({ where, orderBy, limit, page });
    return res.status(200).json({ status: true, ...data });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};
