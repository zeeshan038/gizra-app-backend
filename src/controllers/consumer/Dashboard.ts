import { Request, Response } from 'express';
import prisma from '../../config/database';
import { requireZoneIds } from '../../utils/consumer/zoneHeaders';
import { getBusinessSetting } from '../../utils/consumer/businessSettings';
import {
  countZoneFoodForCategories,
  formatHomeCategory,
  marketplaceTopLevelCategoryFilter,
  resolveCategorySortOrder,
} from '../../utils/consumer/categoryDiscoverHelpers';

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

    let categories = await Promise.all(
      parents.map(async (parent) => {
        const childes = childesByParent.get(parent.id.toString()) ?? [];
        const categoryIds = [parent.id, ...childes.map((c) => c.id)];
        const counts = await countZoneFoodForCategories(categoryIds, zoneIds);

        const formattedChildes = await Promise.all(
          childes.map(async (child) => {
            const childCounts = await countZoneFoodForCategories([child.id], zoneIds);
            return formatHomeCategory(child, {
              products_count: childCounts.products_count,
              order_count: childCounts.order_count,
            });
          })
        );

        return formatHomeCategory(parent, {
          products_count: counts.products_count,
          order_count: counts.order_count,
          childes: formattedChildes.length ? formattedChildes : undefined,
        });
      })
    );

    const defaultStatus = await getBusinessSetting('category_list_default_status');
    const sortBy = await getBusinessSetting('category_list_sort_by_general');
    if (defaultStatus === '0' && sortBy === 'order_count') {
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
