import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireCoordinates, requireZoneIds } from '../../utils/consumer/zoneHeaders';
import { parseCoordinatesFromRequest } from '../../utils/consumer/favouriteHelpers';
import {
    applyDiscoverTypeFilter,
    DISCOVER_RESTAURANT_SELECT,
    distanceKmForRestaurant,
    formatDiscoverRestaurant,
    isOpenFromSchedules,
    loadTodaySchedulesByRestaurantId,
    parseDiscoverType,
} from '../../utils/consumer/restaurantDiscoverHelpers';

const prisma = new PrismaClient();


/*
 * @Description Get active restaurants in the customer zone(s) (query zone_id, e.g. ?zone_id=2)
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

/*
 * @Description Popular restaurants in customer zone(s) — open first, then by order volume (PHP restaurants/popular)
 * @Route GET api/consumer/restaurants/popular
 * @Access Public
 * @Query zone_id — required (from GET /consumer/config/zone-id)
 * @Query latitude, longitude — optional (query or headers); distance badge on cards
 * @Query limit — default 20, max 50
 * @Query page — default 1
 * @Query type — all | veg | non_veg | home_delivery | take_away
 */
export const getPopularRestaurants = async (req: Request, res: Response): Promise<any> => {
    const zoneIds = requireZoneIds(req, res);
    if (!zoneIds) return;

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);
    const skip = (page - 1) * limit;

    const veg = req.query.veg === 'true' || req.query.veg === '1';
    const non_veg = req.query.non_veg === 'true' || req.query.non_veg === '1';
    const top_rated = req.query.top_rated === 'true' || req.query.top_rated === '1';
    const type = parseDiscoverType(req.query.type);
    const coords = parseCoordinatesFromRequest(req);

    const whereClause: Record<string, unknown> = {
        status: true,
        zone_id: { in: zoneIds },
    };
    applyDiscoverTypeFilter(whereClause, type);
    if (veg) whereClause.veg = true;
    if (non_veg) whereClause.non_veg = true;

    try {
        const candidateCap = 50;
        const orderBy = top_rated
            ? [{ rating: 'desc' as const }, { order_count: 'desc' as const }]
            : [{ order_count: 'desc' as const }, { id: 'desc' as const }];

        const candidates = await prisma.restaurants.findMany({
            where: whereClause,
            select: DISCOVER_RESTAURANT_SELECT,
            orderBy,
            take: candidateCap,
        });

        const scheduleMap = await loadTodaySchedulesByRestaurantId(candidates.map((r) => r.id));

        const ranked = candidates
            .map((r) => {
                const schedules = scheduleMap.get(r.id.toString()) ?? [];
                const open = isOpenFromSchedules(schedules);
                return { row: r, open, orderCount: Number(r.order_count) };
            })
            .sort((a, b) => {
                if (a.open !== b.open) return a.open ? -1 : 1;
                if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
                return Number(b.row.id) - Number(a.row.id);
            });

        const pageSlice = ranked.slice(skip, skip + limit);
        const restaurants = pageSlice.map(({ row, open }) =>
            formatDiscoverRestaurant(row, {
                open,
                distanceKm: distanceKmForRestaurant(coords, row.latitude, row.longitude),
            })
        );

        return res.status(200).json({
            status: true,
            data: {
                total_size: ranked.length,
                limit,
                offset: page,
                restaurants,
            },
        });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};

/*
 * @Description Nearby restaurants — sorted by distance from customer (PHP get-restaurants nearest_first / All Restaurants near you)
 * @Route GET api/consumer/restaurants/nearby
 * @Access Public
 * @Query zone_id — required
 * @Query latitude, longitude — required (query or headers)
 */
export const getNearbyRestaurants = async (req: Request, res: Response): Promise<any> => {
    const zoneIds = requireZoneIds(req, res);
    if (!zoneIds) return;

    const coords = requireCoordinates(req, res);
    if (!coords) return;

    const page = parseInt(req.query.page as string, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);
    const skip = (page - 1) * limit;

    const name = (req.query.name as string)?.trim();
    const veg = req.query.veg === 'true' || req.query.veg === '1';
    const non_veg = req.query.non_veg === 'true' || req.query.non_veg === '1';
    const top_rated = req.query.top_rated === 'true' || req.query.top_rated === '1';
    const type = parseDiscoverType(req.query.type);

    const whereClause: Record<string, unknown> = {
        status: true,
        zone_id: { in: zoneIds },
        latitude: { not: null },
        longitude: { not: null },
    };
    applyDiscoverTypeFilter(whereClause, type);
    if (veg) whereClause.veg = true;
    if (non_veg) whereClause.non_veg = true;
    if (name) {
        whereClause.name = { contains: name, mode: 'insensitive' };
    }

    try {
        const rows = await prisma.restaurants.findMany({
            where: whereClause,
            select: DISCOVER_RESTAURANT_SELECT,
        });

        const scheduleMap = await loadTodaySchedulesByRestaurantId(rows.map((r) => r.id));

        const ranked = rows
            .map((row) => {
                const distKm = distanceKmForRestaurant(coords, row.latitude, row.longitude);
                const schedules = scheduleMap.get(row.id.toString()) ?? [];
                const open = isOpenFromSchedules(schedules);
                return {
                    row,
                    open,
                    distKm: distKm ?? Number.POSITIVE_INFINITY,
                };
            })
            .filter((item) => Number.isFinite(item.distKm))
            .sort((a, b) => {
                if (a.open !== b.open) return a.open ? -1 : 1;
                if (a.distKm !== b.distKm) return a.distKm - b.distKm;
                return Number(b.row.order_count) - Number(a.row.order_count);
            });

        if (top_rated) {
            ranked.sort((a, b) => {
                const ratingA = Number(a.row.rating) || 0;
                const ratingB = Number(b.row.rating) || 0;
                if (ratingB !== ratingA) return ratingB - ratingA;
                return a.distKm - b.distKm;
            });
        }

        const pageSlice = ranked.slice(skip, skip + limit);
        const restaurants = pageSlice.map(({ row, open, distKm }) =>
            formatDiscoverRestaurant(row, {
                open,
                distanceKm: Number.isFinite(distKm) ? distKm : null,
            })
        );

        return res.status(200).json({
            status: true,
            data: {
                total_size: ranked.length,
                limit,
                offset: page,
                restaurants,
            },
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

