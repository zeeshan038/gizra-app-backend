import { Request, Response } from 'express';
import prisma from '../../../config/database';
import { createFoodSchema } from '../../../schemas/vendor/Catalog';
import {
    buildAddonLookupFromFoodRows,
    expandAddOnsFromStored,
    loadAddonLookup,
    resolveAddOnIdsForSave,
} from '../../../utils/vendor/catalog/foodAddonHelpers';
import { publicFoodMediaUrl } from '../../../utils/mediaStorage';
import { getFoodPublishQuota } from '../../../utils/vendor/catalog/foodPublishLimits';

const FOOD_LIST_MAX_LIMIT = 5000;

function parseFoodListLimit(raw: unknown): number {
    const n = parseInt(String(raw ?? ''), 10);
    const limit = Number.isFinite(n) && n > 0 ? n : 500;
    return Math.min(limit, FOOD_LIST_MAX_LIMIT);
}

async function publishDraftFoodIds(
    restaurantId: number,
    candidateIds: number[]
): Promise<{ publishedIds: number[]; quota: Awaited<ReturnType<typeof getFoodPublishQuota>> }> {
    const uniqueIds = [...new Set(candidateIds.filter((id) => Number.isFinite(id) && id > 0))];
    if (!uniqueIds.length) {
        return { publishedIds: [], quota: await getFoodPublishQuota(restaurantId) };
    }

    const draftRows = await prisma.food.findMany({
        where: {
            id: { in: uniqueIds },
            restaurant_id: restaurantId,
            is_draft: 1,
        },
        select: { id: true },
        orderBy: { id: 'asc' },
    });

    const toPublish = draftRows.map((r) => Number(r.id));
    const quota = await getFoodPublishQuota(restaurantId);

    if (toPublish.length) {
        await prisma.food.updateMany({
            where: {
                id: { in: toPublish },
                restaurant_id: restaurantId,
                is_draft: 1,
            },
            data: { is_draft: 0, status: true },
        });
    }

    return { publishedIds: toPublish, quota };
}

/** Disabled until mobile app uses base + delta; legacy Flutter sums optionPrice only. */
function applyAdditiveVariationPricing(payload: {
    price?: number;
    variations?: unknown;
}): { price?: number; variations?: unknown } {
    return payload;
}

async function getVendorRestaurant(req: Request) {
    return prisma.restaurants.findFirst({
        where: { vendor_id: Number((req as any).user.id) }
    });
}

function serializeFood(food: Record<string, unknown>) {
    let variations: unknown = food.variations;
    if (typeof variations === 'string') {
        try {
            variations = JSON.parse(variations);
        } catch {
            variations = [];
        }
    }
    const imageStored =
        typeof food.image === 'string' ? food.image : food.image != null ? String(food.image) : null;
    return {
        ...food,
        id: String(food.id),
        variations,
        image_full_url: publicFoodMediaUrl(imageStored),
    };
}

function serializeFoodWithAddons(
    food: Record<string, unknown>,
    addonLookup: Map<number, { id: number; name: string; price: number; status: boolean }>
) {
    const base = serializeFood(food);
    return {
        ...base,
        add_ons: expandAddOnsFromStored(food.add_ons, addonLookup),
    };
}

/**
 * @Description Create a new Food Item
 * @Route POST /api/vendor/catalog/food
 * @Access Private (Vendor)
 */
export const createFood = async (req: Request, res: Response): Promise<any> => {
    const payload = req.body;
    
    // Auto-inject restaurant_id from the logged-in vendor
    const restaurant = await prisma.restaurants.findFirst({
        where: { vendor_id: Number((req as any).user.id) }
    });
    
    if (!restaurant) {
        return res.status(404).json({ status: false, msg: "Restaurant not found for this vendor" });
    }
    
    payload.restaurant_id = Number(restaurant.id);

    const result = createFoodSchema.validate(payload);
    
    if (result.error) {
        return res.status(400).json({ 
            status: false, 
            msg: result.error.details.map((d: any) => d.message).join(',') 
        });
    }

    try {
        const priced = applyAdditiveVariationPricing(payload);
        const addonIds = await resolveAddOnIdsForSave(
            payload.restaurant_id,
            payload.add_ons
        );

        const food = await prisma.food.create({
            data: {
                name: payload.name,
                description: payload.description || '',
                image: payload.image || 'def.png',
                category_id: payload.category_id,
                price: priced.price ?? payload.price,
                restaurant_id: payload.restaurant_id,
                variations: JSON.stringify(priced.variations ?? payload.variations),
                add_ons: JSON.stringify(addonIds),
                status: payload.status !== undefined ? payload.status : true,
                is_draft:
                    payload.is_draft !== undefined && payload.is_draft !== null
                        ? Number(payload.is_draft)
                        : 0,
                veg: false
            }
        });

        const addonLookup = await loadAddonLookup(addonIds);
        
        return res.status(201).json({ 
            status: true, 
            msg: 'Food item created successfully', 
            data: serializeFoodWithAddons(food as Record<string, unknown>, addonLookup),
        });
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};

/**
 * @Description Update Food Item
 * @Route PATCH /api/vendor/catalog/food/:id
 * @Access Private (Vendor)
 */
export const updateFood = async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    const payload = req.body;

    try {
        const existing = await prisma.food.findUnique({ where: { id: Number(id) } });
        if (!existing) {
            return res.status(404).json({ status: false, msg: 'Food item not found' });
        }

        const dataToUpdate: any = {};
        if (payload.name !== undefined) dataToUpdate.name = payload.name;
        if (payload.description !== undefined) dataToUpdate.description = payload.description;
        if (payload.image !== undefined) dataToUpdate.image = payload.image;
        if (payload.category_id !== undefined) dataToUpdate.category_id = payload.category_id;
        const priced = applyAdditiveVariationPricing({
            price: payload.price !== undefined ? payload.price : Number(existing.price),
            variations:
                payload.variations !== undefined
                    ? payload.variations
                    : (() => {
                          try {
                              return JSON.parse(existing.variations || '[]');
                          } catch {
                              return [];
                          }
                      })(),
        });
        if (payload.price !== undefined || payload.variations !== undefined) {
            dataToUpdate.price = priced.price;
        }
        if (payload.variations !== undefined) {
            dataToUpdate.variations = JSON.stringify(priced.variations);
        }
        if (payload.add_ons !== undefined) {
            const addonIds = await resolveAddOnIdsForSave(
                Number(existing.restaurant_id),
                payload.add_ons
            );
            dataToUpdate.add_ons = JSON.stringify(addonIds);
        }
        if (payload.status !== undefined) dataToUpdate.status = payload.status;
        if (payload.is_draft !== undefined) dataToUpdate.is_draft = payload.is_draft;

        const food = await prisma.food.update({
            where: { id: Number(id) },
            data: dataToUpdate
        });

        const addonLookup = await buildAddonLookupFromFoodRows([food]);
        
        return res.status(200).json({
            status: true,
            msg: 'Food item updated successfully',
            data: serializeFoodWithAddons(food as Record<string, unknown>, addonLookup),
        });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};

/**
 * @Description Get all Food Items for a Restaurant
 * @Route GET /api/vendor/catalog/food
 * @Access Private (Vendor)
 */
export const getFoods = async (req: Request, res: Response): Promise<any> => {
    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = parseFoodListLimit(req.query.limit);
    const skip = (page - 1) * limit;

    try {
        const restaurant = await getVendorRestaurant(req);
        if (!restaurant) {
            return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
        }

        const { search } = req.query;

        const whereClause: any = {
            restaurant_id: Number(restaurant.id),
        };

        if (search) {
            whereClause.name = {
                contains: search as string,
                mode: 'insensitive',
            };
        }

        const total = await prisma.food.count({ where: whereClause });

        const foods = await prisma.food.findMany({
            where: whereClause,
            skip,
            take: limit,
            orderBy: { id: 'desc' },
        });

        const addonLookup = await buildAddonLookupFromFoodRows(foods);

        return res.status(200).json({
            status: true,
            data: foods.map((food) =>
                serializeFoodWithAddons(food as Record<string, unknown>, addonLookup)
            ),
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


/**
 * @Description Delete Food
 * @Route GET /api/vendor/catalog/food/:id
 * @Access Private (Vendor)
 */
export const deleteFood = async (req: Request, res: Response): Promise<any> => {
    const { id } = req.params;
    try {
        const foodItem = await prisma.food.findUnique({
            where: { id: Number(id) }
        });

        if (!foodItem) {
            return res.status(404).json({ status: false, msg: 'Food item not found' });
        }

        // Delete related records in a transaction to prevent orphaned data
        await prisma.$transaction([
            prisma.variation_options.deleteMany({ where: { food_id: Number(id) } }),
            prisma.variations.deleteMany({ where: { food_id: Number(id) } }),
            prisma.wishlists.deleteMany({ where: { food_id: Number(id) } }),
            prisma.reviews.deleteMany({ where: { food_id: Number(id) } }),
            prisma.food.delete({ where: { id: Number(id) } })
        ]);

        return res.status(200).json({ status: true, msg: 'Food item deleted successfully', data: foodItem });
    } catch (e: any) {
        return res.status(500).json({ status: false, msg: e.message });
    }
};

/**
 * @Description Bulk publish draft foods
 * @Route POST /api/vendor/catalog/food/bulk-publish
 * @Access Private (Vendor)
 */
export const bulkPublishFoods = async (req: Request, res: Response): Promise<any> => {
    try {
        const restaurant = await getVendorRestaurant(req);
        if (!restaurant) {
            return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
        }

        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ status: false, msg: 'Array of ids is required' });
        }
        if (ids.length > FOOD_LIST_MAX_LIMIT) {
            return res.status(400).json({
                status: false,
                msg: `Too many ids in one request (max ${FOOD_LIST_MAX_LIMIT}). Publish in batches or use publish-all-drafts.`,
            });
        }

        const restaurantId = Number(restaurant.id);
        const numericIds = ids.map((id: unknown) => Number(id));
        const { publishedIds, quota } = await publishDraftFoodIds(restaurantId, numericIds);

        if (!publishedIds.length) {
            return res.status(400).json({
                status: false,
                msg: 'No draft items were published (check selected ids).',
                data: { quota, published_count: 0 },
            });
        }

        const requestedDrafts = numericIds.filter((id) => Number.isFinite(id) && id > 0).length;
        const skipped = Math.max(0, requestedDrafts - publishedIds.length);
        const msg =
            skipped > 0
                ? `Published ${publishedIds.length} draft item(s). ${skipped} skipped (not drafts or wrong restaurant).`
                : 'Foods published successfully';

        return res.status(200).json({
            status: true,
            msg,
            data: {
                published_count: publishedIds.length,
                published_ids: publishedIds.map(String),
                skipped_count: skipped,
                quota,
            },
        });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};

/**
 * @Description Publish every draft food for the vendor restaurant (no id list required)
 * @Route POST /api/vendor/catalog/food/publish-all-drafts
 */
export const publishAllDraftFoods = async (req: Request, res: Response): Promise<any> => {
    try {
        const restaurant = await getVendorRestaurant(req);
        if (!restaurant) {
            return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
        }

        const restaurantId = Number(restaurant.id);
        const drafts = await prisma.food.findMany({
            where: { restaurant_id: restaurantId, is_draft: 1 },
            select: { id: true },
            orderBy: { id: 'asc' },
        });

        const { publishedIds, quota } = await publishDraftFoodIds(
            restaurantId,
            drafts.map((d) => Number(d.id))
        );

        if (!publishedIds.length) {
            const msg = drafts.length === 0 ? 'No draft items to publish' : 'No draft items were published';
            return res.status(400).json({
                status: false,
                msg,
                data: { draft_count: drafts.length, published_count: 0, quota },
            });
        }

        const skipped = drafts.length - publishedIds.length;
        return res.status(200).json({
            status: true,
            msg:
                skipped > 0
                    ? `Published ${publishedIds.length} of ${drafts.length} draft(s).`
                    : `Published ${publishedIds.length} draft item(s).`,
            data: {
                draft_count: drafts.length,
                published_count: publishedIds.length,
                skipped_count: skipped,
                quota,
            },
        });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};

/**
 * @Description Live menu slot usage (drafts do not count)
 * @Route GET /api/vendor/catalog/food/publish-quota
 */
export const getFoodPublishQuotaHandler = async (req: Request, res: Response): Promise<any> => {
    try {
        const restaurant = await getVendorRestaurant(req);
        if (!restaurant) {
            return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
        }
        const quota = await getFoodPublishQuota(Number(restaurant.id));
        const draftCount = await prisma.food.count({
            where: { restaurant_id: Number(restaurant.id), is_draft: 1 },
        });
        return res.status(200).json({
            status: true,
            data: { ...quota, draft_count: draftCount },
        });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};

/**
 * @Description Bulk delete foods
 * @Route POST /api/vendor/catalog/food/bulk-delete
 * @Access Private (Vendor)
 */
export const bulkDeleteFoods = async (req: Request, res: Response): Promise<any> => {
    try {
        const restaurant = await getVendorRestaurant(req);
        if (!restaurant) {
            return res.status(404).json({ status: false, msg: 'Restaurant not found for this vendor' });
        }

        const { ids } = req.body;
        if (!ids || !Array.isArray(ids)) {
            return res.status(400).json({ status: false, msg: 'Array of ids is required' });
        }

        await prisma.food.deleteMany({
            where: {
                id: { in: ids.map((id: any) => Number(id)) },
                restaurant_id: Number(restaurant.id),
            },
        });

        return res.status(200).json({ status: true, msg: 'Foods deleted successfully' });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};