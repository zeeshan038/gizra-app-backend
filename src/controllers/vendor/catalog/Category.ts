import { Request, Response } from 'express';
import prisma from '../../../config/database';
import { createCategorySchema, updateCategorySchema } from '../../../schemas/vendor/Catalog';
import {
  consumerCategoryMediaFields,
  fitDbString,
  normalizeStoredMedia,
} from '../../../utils/mediaStorage';

async function vendorRestaurantId(req: Request): Promise<number | null> {
  const restaurant = await prisma.restaurants.findFirst({
    where: { vendor_id: Number((req as any).user.id) },
  });
  return restaurant ? Number(restaurant.id) : null;
}

function serializeCategoryRow(row: Record<string, unknown>) {
  const imageRaw = String(row.image ?? 'def.png');
  const media = consumerCategoryMediaFields(imageRaw);
  return {
    ...row,
    id: row.id != null ? String(row.id) : row.id,
    image: media.image_full_url ?? imageRaw,
    image_full_url: media.image_full_url,
  };
}

function storedCategoryImage(incoming: string | undefined | null): string {
  const trimmed = incoming?.trim();
  if (!trimmed) return 'def.png';
  return fitDbString(normalizeStoredMedia(trimmed, 'def.png'), 191) || 'def.png';
}

async function findCategoryByNameForVendor(name: string, restaurantId: number) {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const owned = await prisma.categories.findFirst({
    where: {
      status: true,
      name: { equals: trimmed, mode: 'insensitive' },
      restaurant_id: restaurantId,
    },
  });
  if (owned) return owned;

  return prisma.categories.findFirst({
    where: {
      status: true,
      name: { equals: trimmed, mode: 'insensitive' },
      OR: [{ restaurant_id: null }, { restaurant_id: 0 }],
    },
  });
}

/**
 * @Description Create a new Menu Category
 * @Route POST /api/vendor/catalog/category
 * @Access Private (Vendor)
 */
export const createCategory = async (req: Request, res: Response): Promise<any> => {
  const payload = req.body;
  const result = createCategorySchema.validate(payload);

  if (result.error) {
    return res.status(400).json({
      status: false,
      msg: result.error.details.map((d: any) => d.message).join(','),
    });
  }

  const restaurantId = await vendorRestaurantId(req);
  if (!restaurantId) {
    return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
  }

  try {
    const existing = await findCategoryByNameForVendor(String(payload.name), restaurantId);
    if (existing) {
      const dataToUpdate: Record<string, unknown> = {};
      if (existing.restaurant_id == null || Number(existing.restaurant_id) === 0) {
        dataToUpdate.restaurant_id = restaurantId;
      }
      const incomingImage = payload.image?.trim();
      if (incomingImage && incomingImage !== 'def.png') {
        dataToUpdate.image = storedCategoryImage(incomingImage);
      }
      const category =
        Object.keys(dataToUpdate).length > 0
          ? await prisma.categories.update({
              where: { id: existing.id },
              data: dataToUpdate,
            })
          : existing;

      return res.status(200).json({
        status: true,
        msg: 'Category already exists',
        data: serializeCategoryRow(category as Record<string, unknown>),
      });
    }

    const category = await prisma.categories.create({
      data: {
        name: payload.name.trim(),
        image: storedCategoryImage(payload.image),
        parent_id: payload.parent_id || 0,
        position: payload.parent_id ? 1 : 0,
        status: true,
        restaurant_id: restaurantId,
        slug: payload.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '-'),
      },
    });
    return res.status(201).json({
      status: true,
      msg: 'Category created successfully',
      data: serializeCategoryRow(category as Record<string, unknown>),
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Update menu category (e.g. image after AI import)
 * @Route PATCH /api/vendor/catalog/category/:id
 * @Access Private (Vendor)
 */
export const updateCategory = async (req: Request, res: Response): Promise<any> => {
  const { id } = req.params;
  const payload = req.body;
  const result = updateCategorySchema.validate(payload);

  if (result.error) {
    return res.status(400).json({
      status: false,
      msg: result.error.details.map((d: any) => d.message).join(','),
    });
  }

  const restaurantId = await vendorRestaurantId(req);
  if (!restaurantId) {
    return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
  }

  try {
    const existing = await prisma.categories.findUnique({ where: { id: Number(id) } });
    if (!existing) {
      return res.status(404).json({ status: false, msg: 'Category not found' });
    }

    const ownerId =
      existing.restaurant_id != null ? Number(existing.restaurant_id) : null;
    if (ownerId != null && ownerId !== restaurantId) {
      return res.status(403).json({ status: false, msg: 'Not allowed to update this category' });
    }

    const dataToUpdate: Record<string, unknown> = {};
    if (payload.name !== undefined) dataToUpdate.name = payload.name;
    if (payload.image !== undefined) {
      dataToUpdate.image = storedCategoryImage(payload.image);
    }
    if (ownerId == null) {
      dataToUpdate.restaurant_id = restaurantId;
    }

    const category = await prisma.categories.update({
      where: { id: Number(id) },
      data: dataToUpdate,
    });

    return res.status(200).json({
      status: true,
      msg: 'Category updated successfully',
      data: serializeCategoryRow(category as Record<string, unknown>),
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Get all Categories
 * @Route GET /api/vendor/catalog/category
 * @Access Private (Vendor)
 */
export const getCategories = async (req: Request, res: Response): Promise<any> => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 200;
  const skip = (page - 1) * limit;

  const restaurantId = await vendorRestaurantId(req);
  if (!restaurantId) {
    return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
  }

  try {
    const foodRows = await prisma.food.findMany({
      where: { restaurant_id: restaurantId },
      select: { category_id: true },
      distinct: ['category_id'],
    });
    const linkedCategoryIds = foodRows
      .map((row) => Number(row.category_id))
      .filter((id) => Number.isFinite(id) && id > 0);

    const where = {
      status: true,
      OR: [
        { restaurant_id: restaurantId },
        ...(linkedCategoryIds.length ? [{ id: { in: linkedCategoryIds } }] : []),
      ],
    };

    const total = await prisma.categories.count({ where });

    const categories = await prisma.categories.findMany({
      where,
      skip,
      take: limit,
      orderBy: { id: 'desc' },
    });

    return res.status(200).json({
      status: true,
      data: categories.map((row) => serializeCategoryRow(row as Record<string, unknown>)),
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};
