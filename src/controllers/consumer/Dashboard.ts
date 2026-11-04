import { Request, Response } from 'express';
import prisma from '../../config/database';
import { sendApiError, errorMessageFromUnknown } from '../../utils/apiErrorResponse';
import { requireZoneIds } from '../../utils/consumer/zoneHeaders';
import { parseCoordinatesFromRequest } from '../../utils/consumer/favouriteHelpers';
import {
  countZoneFoodForCategories,
  expandHomeCategoryIdsForCount,
  formatHomeCategory,
  marketplaceTopLevelCategoryFilter,
  resolveCategoryListSortSettings,
  resolveCategorySortOrder,
} from '../../utils/consumer/categoryDiscoverHelpers';
import { resolveRestaurantIdsForHomeCategory } from '../../utils/consumer/homeCategoryRestaurants';
import {
  DISCOVER_RESTAURANT_SELECT,
  availabilityMapForRestaurants,
  distanceKmForRestaurant,
  formatDiscoverRestaurant,
} from '../../utils/consumer/restaurantDiscoverHelpers';
import { paginationSkip } from '../../utils/consumer/orderListHelpers';
import {
  findMarketplaceHomeCategoryById,
  parseHomeCategoryLink,
} from '../../utils/admin/homeCategories/homeCategoryHelpers';

/**
 * @Description Home Slider (banners in customer zone(s); query zone_id required)
 * @Route GET api/consumer/home-slider?zone_id=2
 * @Access Public
 */
export const getHomeSlider = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;

  try {
    const banners = await prisma.banners.findMany({
      where: {
        status: true,
        zone_id: { in: zoneIds },
      },
      select: {
        id: true,
        title: true,
        type: true,
        image: true,
        data: true,
        zone_id: true,
      },
      orderBy: { id: 'desc' },
    });

    const formattedBanners = banners.map((banner) => ({
      ...banner,
      id: banner.id.toString(),
      zone_id: banner.zone_id ? Number(banner.zone_id) : 0,
    }));

    return res.status(200).json({
      status: true,
      msg: 'Home sliders fetched successfully',
      data: formattedBanners,
    });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      msg: error.message,
    });
  }
};

/**
 * @Description What's on your mind — marketplace food categories (PHP GET /api/v1/categories/)
 * @Route GET api/consumer/categories?zone_id=1
 * @Access Public
 * @Query name — optional filter by category name
 */
export const getHomeCategories = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;

  const name = (req.query.name as string | undefined)?.trim();

  try {
    const orderBy = await resolveCategorySortOrder();
    const parents = await prisma.categories.findMany({
      where: marketplaceTopLevelCategoryFilter(name),
      select: {
        id: true,
        name: true,
        image: true,
        slug: true,
        priority: true,
        parent_id: true,
      },
      orderBy,
    });

    const parentIds = parents.map((p) => p.id);
    const childRows =
      parentIds.length > 0
        ? await prisma.categories.findMany({
            where: {
              status: true,
              parent_id: { in: parentIds },
              OR: [{ restaurant_id: null }, { restaurant_id: 0 }],
            },
            select: {
              id: true,
              name: true,
              image: true,
              slug: true,
              priority: true,
              parent_id: true,
            },
            orderBy: { priority: 'desc' },
          })
        : [];

    const childesByParent = new Map<string, typeof childRows>();
    for (const child of childRows) {
      const key = child.parent_id.toString();
      const list = childesByParent.get(key) ?? [];
      list.push(child);
      childesByParent.set(key, list);
    }

    const restaurantTileIds = [
      ...new Set(
        parents
          .map((p) => parseHomeCategoryLink(p.slug).restaurantID)
          .filter((id): id is number => id != null)
      ),
    ];
    const restaurantNameById = new Map<number, string>();
    if (restaurantTileIds.length) {
      const rests = await prisma.restaurants.findMany({
        where: { id: { in: restaurantTileIds.map((id) => BigInt(id)) } },
        select: { id: true, name: true },
      });
      for (const r of rests) {
        restaurantNameById.set(Number(r.id), r.name);
      }
    }

    const linkExtrasForRow = (row: { slug: string | null; name: string }) => {
      const link = parseHomeCategoryLink(row.slug);
      if (link.type === 'restaurant' && link.restaurantID != null) {
        return {
          type: 'restaurant' as const,
          restaurantID: String(link.restaurantID),
          restaurantName: restaurantNameById.get(link.restaurantID) ?? row.name,
        };
      }
      return {
        type: 'category' as const,
        restaurantID: null,
        restaurantName: null,
      };
    };

    let categories = await Promise.all(
      parents.map(async (parent) => {
        const childes = childesByParent.get(parent.id.toString()) ?? [];
        const categoryIds = await expandHomeCategoryIdsForCount(
          parent.id,
          childes.map((c) => c.id)
        );
        const counts = await countZoneFoodForCategories(
          categoryIds.map((id) => BigInt(id)),
          zoneIds
        );

        const formattedChildes = await Promise.all(
          childes.map(async (child) => {
            const childCounts = await countZoneFoodForCategories([child.id], zoneIds);
            return formatHomeCategory(child, {
              products_count: childCounts.products_count,
              order_count: childCounts.order_count,
              ...linkExtrasForRow(child),
            });
          })
        );

        return formatHomeCategory(parent, {
          products_count: counts.products_count,
          order_count: counts.order_count,
          childes: formattedChildes.length ? formattedChildes : undefined,
          ...linkExtrasForRow(parent),
        });
      })
    );

    const { useDefaultSort, sortByGeneral } = await resolveCategoryListSortSettings();
    if (!useDefaultSort && sortByGeneral === 'order_count') {
      categories = [...categories].sort((a, b) => b.order_count - a.order_count);
    }

    return res.status(200).json({
      status: true,
      msg: 'Categories fetched successfully',
      data: { categories },
    });
  } catch (error: any) {
    return res.status(500).json({
      status: false,
      msg: error.message,
    });
  }
};

/**
 * @Description Restaurants for a home category (legacy PHP GET /api/v1/categories/restaurants/{id})
 * @Route GET api/consumer/categories/:id/restaurants
 * @Access Public
 */
export const getHomeCategoryRestaurants = async (req: Request, res: Response): Promise<any> => {
  const zoneIds = requireZoneIds(req, res);
  if (!zoneIds) return;

  const categoryId = Number(req.params.id);
  if (!Number.isFinite(categoryId) || categoryId <= 0) {
    return sendApiError(res, 400, 'Invalid category id');
  }

  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  const offset = Math.max(Number(req.query.offset) || 1, 1);
  const coords = parseCoordinatesFromRequest(req);

  try {
    const category = await findMarketplaceHomeCategoryById(categoryId);
    if (!category) {
      return sendApiError(res, 404, 'Category not found');
    }

    const restaurantIdList = await resolveRestaurantIdsForHomeCategory(categoryId, zoneIds);
    if (!restaurantIdList.length) {
      return res.status(200).json({
        status: true,
        total_size: 0,
        limit,
        offset,
        restaurants: [],
      });
    }

    const where = {
      id: { in: restaurantIdList.map((id) => BigInt(id)) },
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

    const availabilityMap = await availabilityMapForRestaurants(rows);
    return res.status(200).json({
      status: true,
      total_size,
      limit,
      offset,
      restaurants: rows.map((row) =>
        formatDiscoverRestaurant(row, {
          availability: availabilityMap.get(row.id.toString()) ?? undefined,
          distanceKm: distanceKmForRestaurant(coords, row.latitude, row.longitude),
        })
      ),
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};
