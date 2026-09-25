import { Request, Response } from 'express';
import prisma from '../../config/database';
import {
  addFavouriteSchema,
  listFavouritesQuerySchema,
  removeFavouriteSchema,
} from '../../schemas/consumer/favourite';
import {
  distanceKm,
  formatFavouriteFood,
  formatFavouriteRestaurant,
  matchesSearch,
  parseCoordinatesFromRequest,
  parseZoneIdsFromRequest,
} from '../../utils/consumer/favouriteHelpers';

function requireUserId(req: Request, res: Response): number | null {
  const userId = Number(req.user?.id);
  if (!userId) {
    res.status(401).json({ status: false, msg: 'Unauthorized' });
    return null;
  }
  return userId;
}

/**
 * @Description Favorites screen — Foods tab & Restaurants tab (PHP wish_list + Figma fields)
 * @Route GET /api/consumer/favourites/list
 * @Query type=food|restaurant|all — which tab to load (default all)
 * @Query search — filter by name (Figma search bar)
 * @Header zoneId — required, e.g. `[1]`
 * @Header latitude, longitude — optional; used for restaurant distance badge
 */
export const listFavourites = async (req: Request, res: Response): Promise<any> => {
  const userId = requireUserId(req, res);
  if (userId == null) return;

  const queryResult = listFavouritesQuerySchema.validate(req.query, { stripUnknown: true });
  if (queryResult.error) {
    return res.status(400).json({
      status: false,
      msg: queryResult.error.details.map((d) => d.message).join(','),
    });
  }
  const { type, search } = queryResult.value as { type: string; search?: string };

  const zoneIds = parseZoneIdsFromRequest(req);
  if (!zoneIds?.length) {
    return res.status(403).json({
      status: false,
      msg: 'Zone id is required',
      errors: [{ code: 'zoneId', message: 'Zone id is required!' }],
    });
  }

  const coords = parseCoordinatesFromRequest(req);
  const loadFoods = type === 'all' || type === 'food';
  const loadRestaurants = type === 'all' || type === 'restaurant';

  try {
    const rows = await prisma.wishlists.findMany({
      where: { user_id: userId },
      orderBy: { id: 'desc' },
    });

    const foods: ReturnType<typeof formatFavouriteFood>[] = [];
    const restaurants: ReturnType<typeof formatFavouriteRestaurant>[] = [];

    for (const row of rows) {
      if (loadFoods && row.food_id != null) {
        const food = await prisma.food.findFirst({
          where: {
            id: BigInt(Number(row.food_id)),
            status: true,
          },
        });
        if (!food || !matchesSearch(food.name, search ?? '')) continue;

        const rest = await prisma.restaurants.findFirst({
          where: {
            id: BigInt(Number(food.restaurant_id)),
            status: true,
            zone_id: { in: zoneIds },
          },
        });
        if (rest) {
          foods.push(formatFavouriteFood(food, rest, row.id));
        }
      } else if (loadRestaurants && row.restaurant_id != null) {
        const restaurant = await prisma.restaurants.findFirst({
          where: {
            id: BigInt(Number(row.restaurant_id)),
            status: true,
            zone_id: { in: zoneIds },
          },
        });
        if (!restaurant || !matchesSearch(restaurant.name, search ?? '')) continue;

        const foods_count = await prisma.food.count({
          where: {
            restaurant_id: Number(restaurant.id),
            status: true,
          },
        });

        let dist: number | null = null;
        if (coords && restaurant.latitude && restaurant.longitude) {
          dist = distanceKm(
            coords.lat,
            coords.lng,
            Number(restaurant.latitude),
            Number(restaurant.longitude)
          );
        }

        restaurants.push(
          formatFavouriteRestaurant(
            { ...restaurant, foods_count },
            { distanceKm: dist, wishlistId: row.id }
          )
        );
      }
    }

    return res.status(200).json({
      status: true,
      msg: 'Success',
      data: {
        foods,
        restaurants,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Add food or restaurant to favourites
 * @Route POST /api/consumer/favourites/add
 */
export const addFavourite = async (req: Request, res: Response): Promise<any> => {
  const userId = requireUserId(req, res);
  if (userId == null) return;

  const result = addFavouriteSchema.validate(req.body, { stripUnknown: true });
  if (result.error) {
    const msg =
      result.error.details[0]?.message?.replace(/^"value" /, '') ??
      result.error.message;
    return res.status(403).json({
      status: false,
      msg,
      errors: [{ code: 'validation', message: msg }],
    });
  }

  const { food_id, restaurant_id } = result.value;

  try {
    if (food_id != null) {
      const food = await prisma.food.findFirst({
        where: { id: BigInt(food_id), status: true },
      });
      if (!food) {
        return res.status(404).json({ status: false, msg: 'Food not found' });
      }

      const existing = await prisma.wishlists.findFirst({
        where: {
          user_id: userId,
          food_id,
          restaurant_id: null,
        },
      });
      if (existing) {
        return res.status(409).json({
          status: false,
          msg: 'Already in wishlist',
          message: 'Already in wishlist',
        });
      }

      await prisma.wishlists.create({
        data: {
          user_id: userId,
          food_id,
          restaurant_id: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    } else if (restaurant_id != null) {
      const restaurant = await prisma.restaurants.findFirst({
        where: { id: BigInt(restaurant_id), status: true },
      });
      if (!restaurant) {
        return res.status(404).json({ status: false, msg: 'Restaurant not found' });
      }

      const existing = await prisma.wishlists.findFirst({
        where: {
          user_id: userId,
          restaurant_id,
          food_id: null,
        },
      });
      if (existing) {
        return res.status(409).json({
          status: false,
          msg: 'Already in wishlist',
          message: 'Already in wishlist',
        });
      }

      await prisma.wishlists.create({
        data: {
          user_id: userId,
          food_id: null,
          restaurant_id,
          created_at: new Date(),
          updated_at: new Date(),
        },
      });
    }

    return res.status(200).json({
      status: true,
      msg: 'Added to wish list',
      message: 'Added to wish list',
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Remove food or restaurant from favourites (body or query)
 * @Route DELETE /api/consumer/favourites/remove
 */
export const removeFavourite = async (req: Request, res: Response): Promise<any> => {
  const userId = requireUserId(req, res);
  if (userId == null) return;

  const payload = { ...req.query, ...req.body };
  const result = removeFavouriteSchema.validate(payload, { stripUnknown: true });
  if (result.error) {
    return res.status(403).json({
      status: false,
      msg: result.error.details.map((d) => d.message).join(','),
    });
  }

  const { food_id, restaurant_id } = result.value;

  try {
    const wishlist = await prisma.wishlists.findFirst({
      where: {
        user_id: userId,
        ...(food_id != null ? { food_id } : {}),
        ...(restaurant_id != null ? { restaurant_id } : {}),
      },
    });

    if (!wishlist) {
      return res.status(404).json({
        status: false,
        msg: 'Not found',
        message: 'Not found',
      });
    }

    await prisma.wishlists.delete({ where: { id: wishlist.id } });

    return res.status(200).json({
      status: true,
      msg: 'Removed from wish list',
      message: 'Removed from wish list',
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};
