import { Request, Response } from 'express';
import prisma from '../../config/database';
import {
  adminAssignHomeCategoryRestaurantsSchema,
  adminCreateHomeCategorySchema,
  adminGenerateHomeCategoryImageSchema,
  adminUpdateHomeCategorySchema,
} from '../../schemas/admin/HomeCategory';
import { generateCategoryImageForName } from '../../utils/vendor/categoryImageGeneration';
import {
  adminHomeCategoryWhere,
  assertAdminHomeCategory,
  loadHomeCategoryRestaurantIds,
  replaceHomeCategoryRestaurants,
  serializeAdminHomeCategory,
  slugifyHomeCategoryName,
  storedHomeCategoryImage,
  decimalCategoryId,
  homeCategoryRestaurantSlug,
  parseHomeCategoryLink,
} from '../../utils/admin/homeCategories/homeCategoryHelpers';

/**
 * @Route POST /api/admin/home-categories/ai/generate-image
 */
export const generateHomeCategoryImage = async (req: Request, res: Response): Promise<any> => {
  const { error, value } = adminGenerateHomeCategoryImageSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      status: false,
      msg: error.details.map((d) => d.message).join(', '),
    });
  }

  try {
    const generated = await generateCategoryImageForName(value.name);
    if (!generated) {
      return res.status(500).json({ status: false, msg: 'Category image generation failed' });
    }
    return res.status(200).json({
      status: true,
      msg: 'Image generated successfully',
      data: { image: generated.image, source: generated.source },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Category image generation failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/home-categories
 */
export const listHomeCategories = async (req: Request, res: Response): Promise<any> => {
  try {
    const rows = await prisma.categories.findMany({
      where: { ...adminHomeCategoryWhere(), status: true },
      orderBy: [{ priority: 'desc' }, { id: 'asc' }],
    });

    const ids = rows.map((r) => Number(r.id));
    const linkCounts =
      ids.length > 0
        ? await prisma.home_category_restaurant.groupBy({
            by: ['category_id'],
            where: { category_id: { in: ids } },
            _count: { restaurant_id: true },
          })
        : [];
    const countByCategory = new Map<number, number>(
      linkCounts.map((g) => [Number(g.category_id), g._count.restaurant_id])
    );

    const restaurantIdsForTiles = [
      ...new Set(
        rows
          .map((row) => parseHomeCategoryLink(row.slug).restaurantID)
          .filter((id): id is number => id != null)
      ),
    ];
    const restaurantNameById = new Map<number, string>();
    if (restaurantIdsForTiles.length) {
      const rests = await prisma.restaurants.findMany({
        where: { id: { in: restaurantIdsForTiles.map((id) => BigInt(id)) } },
        select: { id: true, name: true },
      });
      for (const r of rests) {
        restaurantNameById.set(Number(r.id), r.name);
      }
    }

    return res.status(200).json({
      status: true,
      msg: 'Home categories fetched successfully',
      data: rows.map((row) => {
        const link = parseHomeCategoryLink(row.slug);
        const restaurant_name =
          link.restaurantID != null
            ? restaurantNameById.get(link.restaurantID) ?? row.name
            : null;
        return serializeAdminHomeCategory(row, {
          restaurants_count: countByCategory.get(Number(row.id)) ?? 0,
          restaurant_name,
        });
      }),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to load home categories';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route POST /api/admin/home-categories
 */
export const createHomeCategory = async (req: Request, res: Response): Promise<any> => {
  const { error, value } = adminCreateHomeCategorySchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      status: false,
      msg: error.details.map((d) => d.message).join(', '),
    });
  }

  try {
    const now = new Date();
    const linkType = value.type === 'restaurant' ? 'restaurant' : 'category';
    let displayName = value.name?.trim() ?? '';
    let slug = slugifyHomeCategoryName(displayName || 'category');
    let restaurant_ids: number[] = [];
    let restaurant_name: string | null = null;

    if (linkType === 'restaurant') {
      const restaurantId = Number(value.restaurant_id);
      const restaurant = await prisma.restaurants.findUnique({
        where: { id: BigInt(restaurantId) },
        select: { id: true, name: true },
      });
      if (!restaurant) {
        return res.status(400).json({ status: false, msg: 'Restaurant not found' });
      }
      restaurant_name = restaurant.name;
      displayName = displayName || restaurant.name;
      slug = homeCategoryRestaurantSlug(restaurantId);
      restaurant_ids = [restaurantId];
    }

    if (!displayName) {
      return res.status(400).json({ status: false, msg: 'Name is required' });
    }

    const created = await prisma.categories.create({
      data: {
        name: displayName,
        image: storedHomeCategoryImage(value.image),
        parent_id: BigInt(0),
        position: BigInt(0),
        status: value.status !== false,
        priority: BigInt(value.priority ?? 0),
        slug,
        restaurant_id: null,
        created_at: now,
        updated_at: now,
      },
    });

    if (restaurant_ids.length) {
      await replaceHomeCategoryRestaurants(Number(created.id), restaurant_ids);
    }

    return res.status(201).json({
      status: true,
      msg: 'Home category created successfully',
      data: serializeAdminHomeCategory(created, {
        restaurants_count: restaurant_ids.length,
        restaurant_ids,
        restaurant_name,
      }),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to create home category';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route PATCH /api/admin/home-categories/:id
 */
export const updateHomeCategory = async (req: Request, res: Response): Promise<any> => {
  const categoryId = Number(req.params.id);
  const { error, value } = adminUpdateHomeCategorySchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      status: false,
      msg: error.details.map((d) => d.message).join(', '),
    });
  }

  try {
    const existing = await assertAdminHomeCategory(categoryId);
    const data: Record<string, unknown> = { updated_at: new Date() };
    const nextType =
      value.type === 'restaurant' || value.type === 'category'
        ? value.type
        : parseHomeCategoryLink(existing.slug).type;

    if (value.image !== undefined) {
      data.image = storedHomeCategoryImage(value.image);
    }
    if (value.priority !== undefined) {
      data.priority = BigInt(value.priority);
    }
    if (value.status !== undefined) {
      data.status = value.status;
    }

    let restaurant_name: string | null = null;

    if (nextType === 'restaurant') {
      const restaurantId =
        value.restaurant_id != null
          ? Number(value.restaurant_id)
          : parseHomeCategoryLink(existing.slug).restaurantID;
      if (!restaurantId || !Number.isFinite(restaurantId)) {
        return res.status(400).json({ status: false, msg: 'restaurant_id is required for restaurant tiles' });
      }
      const restaurant = await prisma.restaurants.findUnique({
        where: { id: BigInt(restaurantId) },
        select: { id: true, name: true },
      });
      if (!restaurant) {
        return res.status(400).json({ status: false, msg: 'Restaurant not found' });
      }
      restaurant_name = restaurant.name;
      const displayName = value.name?.trim() || restaurant.name;
      data.name = displayName;
      data.slug = homeCategoryRestaurantSlug(restaurantId);
      await replaceHomeCategoryRestaurants(categoryId, [restaurantId]);
    } else {
      if (value.name !== undefined) {
        data.name = value.name.trim();
        data.slug = slugifyHomeCategoryName(value.name);
      } else if (value.type === 'category') {
        data.slug = slugifyHomeCategoryName(existing.name);
      }
      if (value.type === 'category') {
        await replaceHomeCategoryRestaurants(categoryId, []);
      }
    }

    const updated = await prisma.categories.update({
      where: { id: BigInt(categoryId) },
      data,
    });
    const restaurant_ids = await loadHomeCategoryRestaurantIds(categoryId);
    if (!restaurant_name && nextType === 'restaurant') {
      const rid = parseHomeCategoryLink(updated.slug).restaurantID;
      if (rid != null) {
        const r = await prisma.restaurants.findUnique({
          where: { id: BigInt(rid) },
          select: { name: true },
        });
        restaurant_name = r?.name ?? updated.name;
      }
    }

    return res.status(200).json({
      status: true,
      msg: 'Home category updated successfully',
      data: serializeAdminHomeCategory(updated, {
        restaurants_count: restaurant_ids.length,
        restaurant_ids,
        restaurant_name,
      }),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to update home category';
    const status = msg === 'Home category not found' ? 404 : 500;
    return res.status(status).json({ status: false, msg });
  }
};

/**
 * @Route DELETE /api/admin/home-categories/:id
 */
export const deleteHomeCategory = async (req: Request, res: Response): Promise<any> => {
  const categoryId = Number(req.params.id);
  try {
    await assertAdminHomeCategory(categoryId);
    await prisma.$transaction([
      prisma.home_category_restaurant.deleteMany({
        where: { category_id: decimalCategoryId(categoryId) },
      }),
      prisma.categories.update({
        where: { id: BigInt(categoryId) },
        data: { status: false, updated_at: new Date() },
      }),
    ]);
    return res.status(200).json({
      status: true,
      msg: 'Home category removed successfully',
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete home category';
    const status = msg === 'Home category not found' ? 404 : 500;
    return res.status(status).json({ status: false, msg });
  }
};

/**
 * @Route GET /api/admin/home-categories/:id/restaurants
 */
export const getHomeCategoryRestaurants = async (req: Request, res: Response): Promise<any> => {
  const categoryId = Number(req.params.id);
  try {
    await assertAdminHomeCategory(categoryId);
    const restaurant_ids = await loadHomeCategoryRestaurantIds(categoryId);
    return res.status(200).json({
      status: true,
      msg: 'Assigned restaurants fetched successfully',
      data: { category_id: String(categoryId), restaurant_ids },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to load assignments';
    const status = msg === 'Home category not found' ? 404 : 500;
    return res.status(status).json({ status: false, msg });
  }
};

/**
 * @Route PUT /api/admin/home-categories/:id/restaurants
 */
export const assignHomeCategoryRestaurants = async (req: Request, res: Response): Promise<any> => {
  const categoryId = Number(req.params.id);
  const { error, value } = adminAssignHomeCategoryRestaurantsSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      status: false,
      msg: error.details.map((d) => d.message).join(', '),
    });
  }

  try {
    await replaceHomeCategoryRestaurants(categoryId, value.restaurant_ids);
    return res.status(200).json({
      status: true,
      msg: 'Restaurants assigned successfully',
      data: {
        category_id: String(categoryId),
        restaurant_ids: value.restaurant_ids,
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to assign restaurants';
    let status = 500;
    if (msg === 'Home category not found') status = 404;
    else if (msg.startsWith('Unknown restaurant')) status = 400;
    return res.status(status).json({ status: false, msg });
  }
};
