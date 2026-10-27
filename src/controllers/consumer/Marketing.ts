import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import prisma from '../../config/database';
import { sendApiError, errorMessageFromUnknown } from '../../utils/apiErrorResponse';
import { requireZoneIds } from '../../utils/consumer/zoneHeaders';
import { parseCoordinatesFromRequest } from '../../utils/consumer/favouriteHelpers';
import {
  DISCOVER_RESTAURANT_SELECT,
  distanceKmForRestaurant,
  formatDiscoverRestaurant,
  isOpenFromSchedules,
  loadTodaySchedulesByRestaurantId,
} from '../../utils/consumer/restaurantDiscoverHelpers';
import { publicMediaUrl, publicRestaurantMediaUrl } from '../../utils/mediaStorage';
import { paginationSkip } from '../../utils/consumer/orderListHelpers';

function campaignRunningWhere(): Prisma.campaignsWhereInput {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    status: true,
    OR: [{ start_date: null }, { start_date: { lte: today } }],
    AND: [
      {
        OR: [{ end_date: null }, { end_date: { gte: today } }],
      },
    ],
  };
}

function formatCampaign(row: {
  id: bigint;
  title: string | null;
  image: string | null;
  description: string | null;
  start_date: Date | null;
  end_date: Date | null;
  start_time: Date | null;
  end_time: Date | null;
}) {
  return {
    id: row.id.toString(),
    title: row.title,
    image: row.image,
    image_full_url: publicMediaUrl(row.image),
    description: row.description,
    start_date: row.start_date,
    end_date: row.end_date,
    start_time: row.start_time,
    end_time: row.end_time,
  };
}

async function confirmedCampaignRestaurantIds(campaignIds: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (!campaignIds.length) return map;
  const links = await prisma.$queryRaw<Array<{ campaign_id: unknown; restaurant_id: unknown }>>`
    SELECT campaign_id, restaurant_id
    FROM campaign_restaurant
    WHERE campaign_status = 'confirmed'
      AND campaign_id IN (${Prisma.join(campaignIds)})
  `;
  for (const link of links) {
    const cid = Number(link.campaign_id);
    const rid = Number(link.restaurant_id);
    if (!Number.isFinite(cid) || !Number.isFinite(rid)) continue;
    const list = map.get(cid) ?? [];
    list.push(rid);
    map.set(cid, list);
  }
  return map;
}

async function formatRestaurantsForIds(
  ids: number[],
  zoneIds: number[],
  coords: { lat: number; lng: number } | null
) {
  if (!ids.length) return [];
  const rows = await prisma.restaurants.findMany({
    where: {
      id: { in: ids.map((id) => BigInt(id)) },
      status: true,
      zone_id: { in: zoneIds },
    },
    select: DISCOVER_RESTAURANT_SELECT,
  });
  const scheduleMap = await loadTodaySchedulesByRestaurantId(rows.map((r) => r.id));
  return rows.map((row) =>
    formatDiscoverRestaurant(row, {
      open: isOpenFromSchedules(scheduleMap.get(row.id.toString()) ?? []),
      distanceKm: distanceKmForRestaurant(coords, row.latitude, row.longitude),
    })
  );
}

/**
 * @Description Zone banners plus running campaigns (PHP GET /api/v1/banners)
 * @Route GET /api/consumer/banners
 * @Access Public
 */
export const getBanners = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;
  const coords = parseCoordinatesFromRequest(req);
  try {
    const [banners, campaigns] = await Promise.all([
      prisma.banners.findMany({
        where: { status: true, zone_id: { in: zoneIds } },
        orderBy: { id: 'desc' },
      }),
      prisma.campaigns.findMany({
        where: campaignRunningWhere(),
        orderBy: { id: 'desc' },
      }),
    ]);
    const restaurantMap = await confirmedCampaignRestaurantIds(campaigns.map((c) => Number(c.id)));
    const formattedCampaigns = [];
    for (const campaign of campaigns) {
      const restaurants = await formatRestaurantsForIds(
        restaurantMap.get(Number(campaign.id)) ?? [],
        zoneIds,
        coords
      );
      if (!restaurants.length) continue;
      formattedCampaigns.push({ ...formatCampaign(campaign), restaurants });
    }

    return res.status(200).json({
      status: true,
      campaigns: formattedCampaigns,
      banners: banners.map((b) => ({
        id: b.id.toString(),
        title: b.title,
        type: b.type,
        image: b.image,
        image_full_url: publicMediaUrl(b.image),
        data: b.data,
        zone_id: Number(b.zone_id),
      })),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Running basic campaigns (PHP GET /api/v1/campaigns/basic)
 * @Route GET /api/consumer/campaigns/basic
 * @Access Public
 */
export const getBasicCampaigns = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;
  const coords = parseCoordinatesFromRequest(req);
  try {
    const campaigns = await prisma.campaigns.findMany({
      where: campaignRunningWhere(),
      orderBy: { id: 'desc' },
    });
    const restaurantMap = await confirmedCampaignRestaurantIds(campaigns.map((c) => Number(c.id)));
    const data = [];
    for (const campaign of campaigns) {
      const restaurants = await formatRestaurantsForIds(
        restaurantMap.get(Number(campaign.id)) ?? [],
        zoneIds,
        coords
      );
      if (!restaurants.length) continue;
      data.push({ ...formatCampaign(campaign), restaurants });
    }
    return res.status(200).json({ status: true, data });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description One basic campaign with restaurants (PHP GET /api/v1/campaigns/basic-campaign-details)
 * @Route GET /api/consumer/campaigns/basic-details
 * @Access Public
 */
export const getBasicCampaignDetails = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;
  const campaignId = Number(req.query.basic_campaign_id);
  if (!Number.isFinite(campaignId) || campaignId <= 0) {
    return sendApiError(res, 403, 'basic_campaign_id is required');
  }
  const coords = parseCoordinatesFromRequest(req);
  try {
    const campaign = await prisma.campaigns.findFirst({
      where: { id: BigInt(campaignId), ...campaignRunningWhere() },
    });
    if (!campaign) return sendApiError(res, 404, 'Campaign not found');
    const restaurantMap = await confirmedCampaignRestaurantIds([campaignId]);
    const restaurants = await formatRestaurantsForIds(
      restaurantMap.get(campaignId) ?? [],
      zoneIds,
      coords
    );
    return res.status(200).json({
      status: true,
      data: { ...formatCampaign(campaign), restaurants },
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Item (food) campaigns in zone (PHP GET /api/v1/campaigns/item)
 * @Route GET /api/consumer/campaigns/item
 * @Access Public
 */
export const getItemCampaigns = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;
  try {
    const restaurants = await prisma.restaurants.findMany({
      where: { status: true, zone_id: { in: zoneIds } },
      select: { id: true, name: true },
    });
    const restaurantIds = restaurants.map((r) => Number(r.id));
    const nameById = new Map(restaurants.map((r) => [Number(r.id), r.name]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows = await prisma.item_campaigns.findMany({
      where: {
        status: true,
        restaurant_id: { in: restaurantIds },
        OR: [{ start_date: null }, { start_date: { lte: today } }],
        AND: [{ OR: [{ end_date: null }, { end_date: { gte: today } }] }],
      },
      orderBy: { id: 'desc' },
    });
    return res.status(200).json({
      status: true,
      data: rows.map((row) => ({
        id: row.id.toString(),
        title: row.title,
        image: row.image,
        image_full_url: publicMediaUrl(row.image),
        description: row.description,
        price: Number(row.price),
        discount: Number(row.discount),
        discount_type: row.discount_type,
        restaurant_id: String(row.restaurant_id),
        restaurant_name: nameById.get(Number(row.restaurant_id)) ?? null,
        veg: row.veg,
        start_date: row.start_date,
        end_date: row.end_date,
      })),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Cuisine list (PHP GET /api/v1/cuisine)
 * @Route GET /api/consumer/cuisines
 * @Access Public
 */
export const getCuisines = async (_req: Request, res: Response): Promise<any> => {
  try {
    const rows = await prisma.cuisines.findMany({
      where: { status: true },
      orderBy: { id: 'desc' },
    });
    return res.status(200).json({
      status: true,
      Cuisines: rows.map((c) => ({
        id: c.id.toString(),
        name: c.name,
        image: c.image,
        image_full_url: publicMediaUrl(c.image),
        slug: c.slug,
      })),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Restaurants for a cuisine (PHP GET /api/v1/cuisine/get_restaurants)
 * @Route GET /api/consumer/cuisines/restaurants
 * @Access Public
 */
export const getCuisineRestaurants = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;
  const cuisineId = Number(req.query.cuisine_id);
  if (!Number.isFinite(cuisineId) || cuisineId <= 0) {
    return sendApiError(res, 203, 'cuisine_id is required');
  }
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  const offset = Math.max(Number(req.query.offset) || 1, 1);
  const coords = parseCoordinatesFromRequest(req);
  try {
    const links = await prisma.cuisine_restaurant.findMany({
      where: { cuisine_id: cuisineId },
      select: { restaurant_id: true },
    });
    const ids = links.map((l) => Number(l.restaurant_id)).filter((n) => Number.isFinite(n));
    const where = {
      id: { in: ids.map((id) => BigInt(id)) },
      status: true,
      zone_id: { in: zoneIds },
    };
    const [total_size, rows] = await Promise.all([
      prisma.restaurants.count({ where }),
      prisma.restaurants.findMany({
        where,
        select: DISCOVER_RESTAURANT_SELECT,
        skip: paginationSkip(limit, offset),
        take: limit,
        orderBy: [{ order_count: 'desc' }, { id: 'desc' }],
      }),
    ]);
    const scheduleMap = await loadTodaySchedulesByRestaurantId(rows.map((r) => r.id));
    return res.status(200).json({
      status: true,
      total_size,
      limit,
      offset,
      restaurants: rows.map((row) =>
        formatDiscoverRestaurant(row, {
          open: isOpenFromSchedules(scheduleMap.get(row.id.toString()) ?? []),
          distanceKm: distanceKmForRestaurant(coords, row.latitude, row.longitude),
        })
      ),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Active advertisements in the customer zone (PHP GET /api/v1/advertisement/list)
 * @Route GET /api/consumer/advertisements
 * @Access Public
 */
export const getAdvertisements = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  try {
    const restaurants = await prisma.restaurants.findMany({
      where: { status: true, active: true, zone_id: { in: zoneIds } },
      select: { id: true, name: true, logo: true, rating: true },
    });
    const restaurantIds = restaurants.map((r) => Number(r.id));
    const restaurantById = new Map(
      restaurants.map((r) => [
        Number(r.id),
        {
          id: r.id.toString(),
          name: r.name,
          logo: publicRestaurantMediaUrl(r.logo, 'logo'),
          rating: r.rating ? Number(r.rating) : 0,
        },
      ])
    );
    const ads = await prisma.advertisements.findMany({
      where: {
        status: { in: ['approved', 'running'] },
        restaurant_id: { in: restaurantIds },
        start_date: { lte: today },
        end_date: { gte: today },
      },
      orderBy: [{ priority: 'asc' }, { id: 'desc' }],
    });
    return res.status(200).json({
      status: true,
      data: ads.map((ad) => ({
        id: ad.id.toString(),
        title: ad.title,
        description: ad.description,
        add_type: ad.add_type,
        cover_image: ad.cover_image,
        cover_image_full_url: publicMediaUrl(ad.cover_image),
        profile_image: ad.profile_image,
        profile_image_full_url: publicMediaUrl(ad.profile_image),
        video_attachment: ad.video_attachment,
        start_date: ad.start_date,
        end_date: ad.end_date,
        is_rating_active: ad.is_rating_active,
        is_review_active: ad.is_review_active,
        restaurant: restaurantById.get(Number(ad.restaurant_id)) ?? null,
      })),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};
