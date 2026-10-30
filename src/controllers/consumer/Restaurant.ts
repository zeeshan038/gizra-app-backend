import { Request, Response } from 'express';
import prisma from '../../config/database';
import {
    requireCoordinates,
    requireZoneIds
} from '../../utils/consumer/zoneHeaders';
import {
    parseCoordinatesFromRequest,
    parseZoneIdsFromRequest,
} from '../../utils/consumer/favouriteHelpers';
import {
    applyDiscoverTypeFilter,
    DISCOVER_RESTAURANT_SELECT,
    distanceKmForRestaurant,
    availabilityMapForRestaurants,
    computeAvailabilityForRestaurant,
    formatDiscoverRestaurant,
    formatMapRestaurant,
    isRestaurantInsideBounds,
    loadActiveDiscountRestaurantIds,
    restaurantAvailabilityResponseFields,
    parseDiscoverType,
    parseMapBoundsFromQuery,
    parseRestaurantCoordinates,
} from '../../utils/consumer/restaurantDiscoverHelpers';
import {
    buildRestaurantFoodWhere,
    formatRestaurantMenuFood,
    loadRestaurantMenuCategories,
    parseMenuFoodType,
    parseOptionalCategoryId,
} from '../../utils/consumer/restaurantMenuHelpers';
import { variationsForMobileClient } from '../../utils/consumer/variationsForMobileClient';
import { consumerFoodMediaFields, consumerRestaurantMediaFields } from '../../utils/mediaStorage';
import { recordRestaurantVisit } from '../../utils/consumer/visitorLog';

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
        const discounted =
            req.query.discounted === 'true' ||
            req.query.discounted === '1' ||
            req.query.discount === 'true' ||
            req.query.discount === '1';

        const whereClause: any = {
            status: true,
            zone_id: { in: zoneIds },
        };
        if (name) {
            whereClause.name = { contains: name, mode: 'insensitive' };
        }
        if (veg) whereClause.veg = true;
        if (non_veg) whereClause.non_veg = true;

        if (discounted) {
            const discountedIds = await loadActiveDiscountRestaurantIds();
            whereClause.id = { in: discountedIds };
        }

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
                    active: true,
                },
                skip,
                take: limit,
                orderBy
            })
        ]);

        const availabilityMap = await availabilityMapForRestaurants(restaurants);

        const formattedRestaurants = restaurants.map((r) => {
            const availability = restaurantAvailabilityResponseFields(
                availabilityMap.get(r.id.toString()) ?? {
                    status: 'CLOSED',
                    can_order: false,
                    next_open_at: null,
                    next_close_at: null,
                    is_temporarily_closed: r.active === false,
                }
            );
            return {
                ...r,
                id: r.id.toString(),
                minimum_order: r.minimum_order ? Number(r.minimum_order) : 0,
                tax: r.tax ? Number(r.tax) : 0,
                rating: r.rating ? Number(r.rating) : 0,
                ...consumerRestaurantMediaFields({
                    logo: r.logo,
                    cover_photo: r.cover_photo,
                }),
                ...availability,
            };
        });

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
    const discounted =
        req.query.discounted === 'true' ||
        req.query.discounted === '1' ||
        req.query.discount === 'true' ||
        req.query.discount === '1';
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
        if (discounted) {
            const discountedIds = await loadActiveDiscountRestaurantIds();
            whereClause.id = { in: discountedIds };
        }
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

        const availabilityMap = await availabilityMapForRestaurants(candidates);

        const ranked = candidates
            .map((r) => {
                const availability = availabilityMap.get(r.id.toString());
                const canOrder = availability?.can_order ?? false;
                return { row: r, canOrder, orderCount: Number(r.order_count), availability };
            })
            .sort((a, b) => {
                if (a.canOrder !== b.canOrder) return a.canOrder ? -1 : 1;
                if (b.orderCount !== a.orderCount) return b.orderCount - a.orderCount;
                return Number(b.row.id) - Number(a.row.id);
            });

        const pageSlice = ranked.slice(skip, skip + limit);
        const restaurants = pageSlice.map(({ row, availability }) =>
            formatDiscoverRestaurant(row, {
                availability: availability ?? undefined,
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
    const discounted =
        req.query.discounted === 'true' ||
        req.query.discounted === '1' ||
        req.query.discount === 'true' ||
        req.query.discount === '1';
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
        if (discounted) {
            const discountedIds = await loadActiveDiscountRestaurantIds();
            whereClause.id = { in: discountedIds };
        }
        const rows = await prisma.restaurants.findMany({
            where: whereClause,
            select: DISCOVER_RESTAURANT_SELECT,
        });

        const availabilityMap = await availabilityMapForRestaurants(rows);

        const ranked = rows
            .map((row) => {
                const distKm = distanceKmForRestaurant(coords, row.latitude, row.longitude);
                const availability = availabilityMap.get(row.id.toString());
                const canOrder = availability?.can_order ?? false;
                return {
                    row,
                    canOrder,
                    availability,
                    distKm: distKm ?? Number.POSITIVE_INFINITY,
                };
            })
            .filter((item) => Number.isFinite(item.distKm))
            .sort((a, b) => {
                if (a.canOrder !== b.canOrder) return a.canOrder ? -1 : 1;
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
        const restaurants = pageSlice.map(({ row, availability, distKm }) =>
            formatDiscoverRestaurant(row, {
                availability: availability ?? undefined,
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

/*
 * @Description Map discover — all active restaurants with coordinates for map pins (Find Nearby / See Location)
 * @Route GET api/consumer/restaurants/discover/map
 * @Access Public
 * @Query zone_id — required (from GET /consumer/config/zone-id)
 * @Query latitude, longitude — optional (query or headers); map center + distance on pins
 * @Query min_lat, max_lat, min_lng, max_lng — optional viewport filter (visible map region)
 * @Query radius_km — optional; with lat/lng, only restaurants within this radius
 * @Query type — all | veg | non_veg | home_delivery | take_away
 */
export const getDiscoverMapRestaurants = async (req: Request, res: Response): Promise<any> => {
    const zoneIds = requireZoneIds(req, res);
    if (!zoneIds) return;

    const coords = parseCoordinatesFromRequest(req);
    const bounds = parseMapBoundsFromQuery(req.query as Record<string, unknown>);
    const radiusRaw = req.query.radius_km ?? req.query.radius;
    const radiusKm =
        radiusRaw != null && String(radiusRaw).trim() !== ''
            ? Number(radiusRaw)
            : null;

    if (radiusKm != null && (!Number.isFinite(radiusKm) || radiusKm <= 0)) {
        return res.status(400).json({ status: false, msg: 'radius_km must be a positive number' });
    }
    if (radiusKm != null && !coords) {
        return res.status(400).json({
            status: false,
            msg: 'latitude and longitude are required when radius_km is set',
        });
    }

    const name = (req.query.name as string)?.trim();
    const veg = req.query.veg === 'true' || req.query.veg === '1';
    const non_veg = req.query.non_veg === 'true' || req.query.non_veg === '1';
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
            orderBy: [{ order_count: 'desc' }, { id: 'desc' }],
        });

        const availabilityMap = await availabilityMapForRestaurants(rows);

        let filtered = rows
            .map((row) => {
                const position = parseRestaurantCoordinates(row.latitude, row.longitude);
                if (!position) return null;

                const availability = availabilityMap.get(row.id.toString());
                const canOrder = availability?.can_order ?? false;
                const distKm = distanceKmForRestaurant(coords, row.latitude, row.longitude);

                return { row, canOrder, availability, position, distKm };
            })
            .filter((item): item is NonNullable<typeof item> => item != null);

        if (bounds) {
            filtered = filtered.filter(({ position }) =>
                isRestaurantInsideBounds(position, bounds)
            );
        }

        if (radiusKm != null && coords) {
            filtered = filtered.filter(
                ({ distKm }) => distKm != null && distKm <= radiusKm
            );
        }

        filtered.sort((a, b) => {
            if (a.canOrder !== b.canOrder) return a.canOrder ? -1 : 1;
            const distA = a.distKm ?? Number.POSITIVE_INFINITY;
            const distB = b.distKm ?? Number.POSITIVE_INFINITY;
            if (distA !== distB) return distA - distB;
            return Number(b.row.order_count) - Number(a.row.order_count);
        });

        const restaurants = filtered.map(({ row, availability, distKm }) =>
            formatMapRestaurant(row, {
                availability: availability ?? undefined,
                distanceKm: distKm,
            })
        );

        return res.status(200).json({
            status: true,
            data: {
                total_size: restaurants.length,
                center: coords
                    ? { latitude: coords.lat, longitude: coords.lng }
                    : null,
                bounds: bounds
                    ? {
                        min_lat: bounds.minLat,
                        max_lat: bounds.maxLat,
                        min_lng: bounds.minLng,
                        max_lng: bounds.maxLng,
                    }
                    : null,
                restaurants,
            },
        });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};

/**
 * @Description Menu categories for a restaurant (horizontal filter chips: All, Pizza, …)
 * @Route GET api/consumer/restaurants/:id/categories
 * @Access Public
 */
export const getRestaurantMenuCategories = async (req: Request, res: Response): Promise<any> => {
    const restaurantId = Number(req.params.id);
    if (!Number.isFinite(restaurantId) || restaurantId <= 0) {
        return res.status(400).json({ status: false, msg: 'Invalid restaurant ID' });
    }

    try {
        const restaurant = await prisma.restaurants.findFirst({
            where: { id: BigInt(restaurantId), status: true },
            select: { id: true, name: true },
        });
        if (!restaurant) {
            return res.status(404).json({ status: false, msg: 'Restaurant not found' });
        }

        const categories = await loadRestaurantMenuCategories(restaurantId);

        return res.status(200).json({
            status: true,
            data: {
                restaurant_id: String(restaurantId),
                categories,
                category_ids: categories.map((c) => Number(c.id)),
            },
        });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};

/**
 * @Description Get foods for a restaurant (menu list + category/search filters)
 * @Route GET api/consumer/restaurants/:id/foods
 * @Access Public
 * @Query category_id — optional; omit or `all` for every item; matches parent + subcategories
 * @Query name — optional search within this restaurant menu
 * @Query type — all | veg | non_veg
 */
export const getRestaurantFoods = async (req: Request, res: Response): Promise<any> => {
    try {
        const restaurantId = Number(req.params.id as string);
        if (!Number.isFinite(restaurantId) || restaurantId <= 0) {
            return res.status(400).json({ status: false, msg: 'Invalid restaurant ID' });
        }

        const page = parseInt(req.query.page as string) || 1;
        const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
        const skip = (page - 1) * limit;
        const categoryId = parseOptionalCategoryId(req.query.category_id);
        const name = (req.query.name as string) ?? (req.query.search as string);
        const type = parseMenuFoodType(req.query.type);

        const restaurant = await prisma.restaurants.findFirst({
            where: { id: BigInt(restaurantId), status: true },
            select: { id: true, name: true },
        });
        if (!restaurant) {
            return res.status(404).json({ status: false, msg: 'Restaurant not found' });
        }

        const whereClause = await buildRestaurantFoodWhere({
            restaurantId,
            categoryId,
            name,
            type,
        });

        const [total, foods] = await Promise.all([
            prisma.food.count({ where: whereClause }),
            prisma.food.findMany({
                where: whereClause,
                skip,
                take: limit,
                orderBy: [{ order_count: 'desc' }, { id: 'desc' }],
            }),
        ]);

        const { buildAddonLookupFromFoodRows } = await import(
            '../../utils/vendor/catalog/foodAddonHelpers'
        );
        const addonLookup = await buildAddonLookupFromFoodRows(foods);
        const formattedFoods = foods.map((f) =>
            formatRestaurantMenuFood(f, { restaurant_name: restaurant.name }, addonLookup)
        );

        return res.status(200).json({
            status: true,
            data: {
                total_size: total,
                limit,
                offset: page,
                category_id: categoryId != null ? String(categoryId) : null,
                foods: formattedFoods,
            },
        });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};


/**
 * @Description Search foods and restaurants (restaurants that sell matching items or match by name)
 * @Route GET api/consumer/foods/search
 * @Access Public
 * @Query zone_id — optional; limits results to customer zone(s)
 */
export const searchFoods = async (req: Request, res: Response): Promise<any> => {
    try {
        const name = (req.query.name as string)?.trim();
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;
        const zoneIds = parseZoneIdsFromRequest(req);
        const coords = parseCoordinatesFromRequest(req);

        if (!name) {
            return res.status(400).json({ status: false, msg: 'Search name is required' });
        }

        const foodWhere: {
            status: boolean;
            name: { contains: string; mode: 'insensitive' };
            restaurant_id?: { in: number[] };
        } = {
            status: true,
            name: { contains: name, mode: 'insensitive' },
        };

        if (zoneIds?.length) {
            const inZone = await prisma.restaurants.findMany({
                where: { status: true, zone_id: { in: zoneIds } },
                select: { id: true },
            });
            const restaurantIdsInZone = inZone.map((r) => Number(r.id));
            foodWhere.restaurant_id = { in: restaurantIdsInZone };
        }

        const [foodTotal, foods, foodRestaurantRows] = await Promise.all([
            prisma.food.count({ where: foodWhere }),
            prisma.food.findMany({
                where: foodWhere,
                skip,
                take: limit,
                orderBy: { id: 'desc' },
            }),
            prisma.food.findMany({
                where: foodWhere,
                select: { restaurant_id: true },
                distinct: ['restaurant_id'],
            }),
        ]);

        const restaurantIdsFromFood = [
            ...new Set(
                foodRestaurantRows
                    .map((row) => (row.restaurant_id != null ? Number(row.restaurant_id) : null))
                    .filter((id): id is number => id != null && Number.isFinite(id))
            ),
        ].map((id) => BigInt(id));

        const restaurantOr: Record<string, unknown>[] = [];
        if (restaurantIdsFromFood.length) {
            restaurantOr.push({ id: { in: restaurantIdsFromFood } });
        }
        restaurantOr.push({ name: { contains: name, mode: 'insensitive' } });

        const restaurantWhere: Record<string, unknown> = {
            status: true,
            OR: restaurantOr,
        };
        if (zoneIds?.length) {
            restaurantWhere.zone_id = { in: zoneIds };
        }

        const [restaurantTotal, restaurantRows] = await Promise.all([
            prisma.restaurants.count({ where: restaurantWhere }),
            prisma.restaurants.findMany({
                where: restaurantWhere,
                select: DISCOVER_RESTAURANT_SELECT,
                skip,
                take: limit,
                orderBy: [{ order_count: 'desc' }, { id: 'desc' }],
            }),
        ]);

        const availabilityMap = await availabilityMapForRestaurants(restaurantRows);

        const formattedFoods = foods.map((f) => {
            let parsedVariations: unknown[] = [];
            let parsedAddOns: unknown[] = [];

            try {
                if (f.variations) {
                    parsedVariations = variationsForMobileClient(
                        Number(f.price),
                        JSON.parse(f.variations)
                    );
                }
            } catch (e) { }
            try {
                if (f.add_ons) parsedAddOns = JSON.parse(f.add_ons);
            } catch (e) { }

            return {
                id: f.id.toString(),
                name: f.name,
                description: f.description,
                ...consumerFoodMediaFields(f.image),
                category_id: f.category_id?.toString() || null,
                restaurant_id: f.restaurant_id?.toString() || null,
                price: Number(f.price),
                discount: Number(f.discount),
                veg: f.veg,
                status: f.status,
                variations: parsedVariations,
                add_ons: parsedAddOns,
            };
        });

        const formattedRestaurants = restaurantRows.map((r) => {
            const availability = availabilityMap.get(r.id.toString());
            const distKm = distanceKmForRestaurant(coords, r.latitude, r.longitude);
            return formatDiscoverRestaurant(r, { availability: availability ?? undefined, distanceKm: distKm });
        });

        return res.status(200).json({
            status: true,
            data: {
                total_size: foodTotal,
                restaurants_total_size: restaurantTotal,
                limit,
                offset: page,
                foods: formattedFoods,
                restaurants: formattedRestaurants,
            },
        });
    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};


/**
 * @Description Specific restaurant details
 * @Route GET /api/consumer/restaurants/specific/:id
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

        if (req.user?.id && !req.user.isGuest) {
            void recordRestaurantVisit(Number(req.user.id), id);
        }

        const [availability, categories] = await Promise.all([
            computeAvailabilityForRestaurant(restaurant.id, restaurant.active),
            loadRestaurantMenuCategories(id),
        ]);
        const availabilityFields = restaurantAvailabilityResponseFields(availability);

        const media = consumerRestaurantMediaFields({
            logo: restaurant.logo,
            cover_photo: restaurant.cover_photo,
        });

        return res.status(200).json({
            status: true,
            data: {
                ...restaurant,
                id: restaurant.id.toString(),
                minimum_order: restaurant.minimum_order ? Number(restaurant.minimum_order) : 0,
                rating: restaurant.rating ? Number(restaurant.rating) : 0,
                ...media,
                ...availabilityFields,
                categories,
                category_ids: categories.map((c) => Number(c.id)),
            }
        });

    } catch (error: any) {
        return res.status(500).json({ status: false, msg: error.message });
    }
};

