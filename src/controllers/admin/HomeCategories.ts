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
      where: adminHomeCategoryWhere(),
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

    return res.status(200).json({
      status: true,
      msg: 'Home categories fetched successfully',
      data: rows.map((row) =>
        serializeAdminHomeCategory(row, {
          restaurants_count: countByCategory.get(Number(row.id)) ?? 0,
        })
      ),
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
    const created = await prisma.categories.create({
      data: {
        name: value.name.trim(),
        image: storedHomeCategoryImage(value.image),
        parent_id: BigInt(0),
        position: BigInt(0),
        status: value.status !== false,
        priority: BigInt(value.priority ?? 0),
        slug: slugifyHomeCategoryName(value.name),
        restaurant_id: null,
        created_at: now,
        updated_at: now,
      },
    });

    return res.status(201).json({
      status: true,
      msg: 'Home category created successfully',
      data: serializeAdminHomeCategory(created, { restaurants_count: 0, restaurant_ids: [] }),
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
    await assertAdminHomeCategory(categoryId);
    const data: Record<string, unknown> = { updated_at: new Date() };
    if (value.name !== undefined) {
      data.name = value.name.trim();
      data.slug = slugifyHomeCategoryName(value.name);
    }
    if (value.image !== undefined) {
      data.image = storedHomeCategoryImage(value.image);
    }
    if (value.priority !== undefined) {
      data.priority = BigInt(value.priority);
    }
    if (value.status !== undefined) {
      data.status = value.status;
    }

    const updated = await prisma.categories.update({
      where: { id: BigInt(categoryId) },
      data,
    });
    const restaurant_ids = await loadHomeCategoryRestaurantIds(categoryId);

    return res.status(200).json({
      status: true,
      msg: 'Home category updated successfully',
      data: serializeAdminHomeCategory(updated, {
        restaurants_count: restaurant_ids.length,
        restaurant_ids,
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
      prisma.home_category_restaurant.deleteMany({ where: { category_id: categoryId } }),
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
