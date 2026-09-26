import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireZoneIds } from '../../utils/consumer/zoneHeaders';

const prisma = new PrismaClient();


/* 
 * @Description Get active restaurants in the customer zone(s) (header zoneId, e.g. "[1]")
 * @Route GET api/consumer/restaurants/all
 * @Access Public
 */
export const getRestaurants = async (req: Request, res: Response): Promise<any> => {
    const zoneIds = requireZoneIds(req, res);
    if (!zoneIds) return;

    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const name = req.query.name as string;
        const veg = req.query.veg === 'true' || req.query.veg === '1';
        const non_veg = req.query.non_veg === 'true' || req.query.non_veg === '1';
        const top_rated = req.query.top_rated === 'true' || req.query.top_rated === '1';
        const discounted = req.query.discounted === 'true' || req.query.discounted === '1'; // Placeholder if needed

        const whereClause: any = {
            status: true,
            zone_id: { in: zoneIds },
        };
        if (name) {
            whereClause.name = { contains: name, mode: 'insensitive' };
        }
        if (veg) whereClause.veg = true;
        if (non_veg) whereClause.non_veg = true;

        let orderBy: any = { id: 'desc' };
        if (top_rated) {
            orderBy = { rating: 'desc' };
        }

        const [total, restaurants] = await Promise.all([
            prisma.restaurants.count({ where: whereClause }),
            prisma.restaurants.findMany({
                where: whereClause,
                select: {
                    id: true,
                    name: true,
                    logo: true,
                    cover_photo: true,
                    delivery_time: true,
                    minimum_order: true,
                    tax: true,
                    rating: true,
                    address: true,
                },
                skip,
                take: limit,
                orderBy
            })
        ]);

        const formattedRestaurants = restaurants.map(r => ({
            ...r,
            id: r.id.toString(),
            minimum_order: r.minimum_order ? Number(r.minimum_order) : 0,
            tax: r.tax ? Number(r.tax) : 0,
            rating: r.rating ? Number(r.rating) : 0
        }));

        return res.status(200).json({
            status: true,
            data: {
                total_size: total,
                limit,
                offset: page,
                restaurants: formattedRestaurants
            }
        });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};

/**
 * @Description Get all foods for a specific restaurant
 * @Route GET api/consumer/restaurants/:id/foods
 * @Access Public
 */
export const getRestaurantFoods = async (req: Request, res: Response): Promise<any> => {
    try {
        const restaurantId = Number(req.params.id as string);
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const [total, foods] = await Promise.all([
            prisma.food.count({
                where: {
                    restaurant_id: restaurantId,
                    status: true
                }
            }),
            prisma.food.findMany({
                where: {
                    restaurant_id: restaurantId,
                    status: true
                },
                skip,
                take: limit,
                orderBy: { id: 'desc' }
            })
        ]);

        const formattedFoods = foods.map(f => {
            let parsedVariations = [];
            let parsedAddOns = [];
            let parsedChoiceOptions = [];
            
            try { if (f.variations) parsedVariations = JSON.parse(f.variations); } catch (e) {}
            try { if (f.add_ons) parsedAddOns = JSON.parse(f.add_ons); } catch (e) {}
            try { if (f.choice_options) parsedChoiceOptions = JSON.parse(f.choice_options); } catch (e) {}

            return {
                id: f.id.toString(),
                name: f.name,
                description: f.description,
                image: f.image,
                category_id: f.category_id?.toString() || null,
                restaurant_id: f.restaurant_id?.toString() || null,
                price: Number(f.price),
                discount: Number(f.discount),
                veg: f.veg,
                status: f.status,
                variations: parsedVariations,
                add_ons: parsedAddOns
            };
        });

        return res.status(200).json({
            status: true,
            data: {
                total_size: total,
                limit,
                offset: page,
                foods: formattedFoods
            }
        });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};


/**
 * @Description Search all active foods globally by name
 * @Route GET api/consumer/foods/search
 * @Access Public
 */
export const searchFoods = async (req: Request, res: Response): Promise<any> => {
    try {
        const name = req.query.name as string;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        if (!name) {
            return res.status(400).json({ status: false, msg: 'Search name is required' });
        }

        const whereClause = {
            status: true,
            name: { contains: name, mode: 'insensitive' as const }
        };

        const [total, foods] = await Promise.all([
            prisma.food.count({ where: whereClause }),
            prisma.food.findMany({
                where: whereClause,
                skip,
                take: limit,
                orderBy: { id: 'desc' }
            })
        ]);

        const formattedFoods = foods.map(f => {
            let parsedVariations = [];
            let parsedAddOns = [];
            let parsedChoiceOptions = [];
            
            try { if (f.variations) parsedVariations = JSON.parse(f.variations); } catch (e) {}
            try { if (f.add_ons) parsedAddOns = JSON.parse(f.add_ons); } catch (e) {}
            try { if (f.choice_options) parsedChoiceOptions = JSON.parse(f.choice_options); } catch (e) {}

            return {
                id: f.id.toString(),
                name: f.name,
                description: f.description,
                image: f.image,
                category_id: f.category_id?.toString() || null,
                restaurant_id: f.restaurant_id?.toString() || null,
                price: Number(f.price),
                discount: Number(f.discount),
                veg: f.veg,
                status: f.status,
                variations: parsedVariations,
                add_ons: parsedAddOns
            };
        });

        return res.status(200).json({
            status: true,
            data: {
                total_size: total,
                limit,
                offset: page,
                foods: formattedFoods
            }
        });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};


/**
 * @Description Specific Restaurant Details
 * @Route GET api/consumer/restaurants/specfic/:id
 * @Access Public
 */
export const getRestaurantDetails = async (req: Request, res: Response): Promise<any> => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
        return res.status(400).json({ status: false, msg: 'Invalid restaurant ID' });
    }
    try {
        const restaurant = await prisma.restaurants.findUnique({
            where: { id: id, status: true },
            select: {
                id: true,
                name: true,
                logo: true,
                cover_photo: true,
                delivery_time: true,
                minimum_order: true,
                rating: true,
                address: true,
                veg: true,
                non_veg: true,
                active: true,
                latitude: true,
                longitude: true
            }
        });

        if (!restaurant) {
            return res.status(404).json({ status: false, msg: 'Restaurant not found' });
        }

        return res.status(200).json({
            status: true,
            data: {
                ...restaurant,
                id: restaurant.id.toString(),
                minimum_order: restaurant.minimum_order ? Number(restaurant.minimum_order) : 0,
                rating: restaurant.rating ? Number(restaurant.rating) : 0
            }
        });

    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};

