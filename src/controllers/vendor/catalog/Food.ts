import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { createFoodSchema } from '../../../schemas/vendor/Catalog';

const prisma = new PrismaClient();

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
    return {
        ...food,
        id: String(food.id),
        variations,
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
        const food = await prisma.food.create({
            data: {
                name: payload.name,
                description: payload.description || '',
                image: payload.image || 'def.png',
                category_id: payload.category_id,
                price: payload.price,
                restaurant_id: payload.restaurant_id,
                variations: JSON.stringify(payload.variations),
                add_ons: JSON.stringify(payload.add_ons),
                status: payload.status !== undefined ? payload.status : true,
                is_draft:
                    payload.is_draft !== undefined && payload.is_draft !== null
                        ? Number(payload.is_draft)
                        : 0,
                veg: false
            }
        });
        
        return res.status(201).json({ 
            status: true, 
            msg: 'Food item created successfully', 
            data: { ...food, id: food.id.toString() } 
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
        const dataToUpdate: any = {};
        if (payload.name !== undefined) dataToUpdate.name = payload.name;
        if (payload.description !== undefined) dataToUpdate.description = payload.description;
        if (payload.image !== undefined) dataToUpdate.image = payload.image;
        if (payload.category_id !== undefined) dataToUpdate.category_id = payload.category_id;
        if (payload.price !== undefined) dataToUpdate.price = payload.price;
        if (payload.variations !== undefined) dataToUpdate.variations = JSON.stringify(payload.variations);
        if (payload.add_ons !== undefined) dataToUpdate.add_ons = JSON.stringify(payload.add_ons);
        if (payload.status !== undefined) dataToUpdate.status = payload.status;
        if (payload.is_draft !== undefined) dataToUpdate.is_draft = payload.is_draft;

        const food = await prisma.food.update({
            where: { id: Number(id) },
            data: dataToUpdate
        });
        
        return res.status(200).json({ status: true, msg: 'Food item updated successfully', data: food });
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
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 500;
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

        return res.status(200).json({
            status: true,
            data: foods.map((food) => serializeFood(food as Record<string, unknown>)),
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

        await prisma.food.updateMany({
            where: {
                id: { in: ids.map((id: any) => Number(id)) },
                restaurant_id: Number(restaurant.id),
            },
            data: { is_draft: 0, status: true },
        });

        return res.status(200).json({ status: true, msg: 'Foods published successfully' });
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