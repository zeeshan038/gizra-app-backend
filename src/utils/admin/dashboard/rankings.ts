import prisma from '../../../config/database';
import { publicMediaUrl, publicRestaurantMediaUrl } from '../../mediaStorage';
import { AdminDashboardZoneId } from './types';
import { restaurantIdsForZone, restaurantsZoneWhere } from './zoneFilter';

function mapFoodImage(stored: string | null | undefined): string | null {
  const image = stored?.trim() || null;
  if (!image) return null;
  const path = image.includes('/') ? image : `product/${image}`;
  return publicMediaUrl(path);
}

function mapDeliveryManImage(stored: string | null | undefined): string | null {
  const image = stored?.trim() || null;
  if (!image) return null;
  const path = image.includes('/') ? image : `delivery-man/${image}`;
  return publicMediaUrl(path);
}

function dmDisplayName(row: { f_name: string | null; l_name: string | null }): string {
  return [row.f_name, row.l_name].filter(Boolean).join(' ').trim() || 'Delivery man';
}

export async function getAdminDashboardRankings(zoneId: AdminDashboardZoneId) {
  const zoneRestaurantIds = await restaurantIdsForZone(zoneId);
  const foodZoneWhere =
    zoneRestaurantIds == null
      ? {}
      : { restaurant_id: { in: zoneRestaurantIds } };

  const wishlistWhere =
    zoneRestaurantIds == null
      ? { restaurant_id: { not: null } }
      : { restaurant_id: { in: zoneRestaurantIds } };

  const [wishlistGroups, topSellingRows, topRatedRows, topDmRows, topRestaurantRows] =
    await Promise.all([
      prisma.wishlists.groupBy({
        by: ['restaurant_id'],
        where: wishlistWhere,
        _count: { restaurant_id: true },
        orderBy: { _count: { restaurant_id: 'desc' } },
        take: 12,
      }),
      prisma.food.findMany({
        where: foodZoneWhere,
        orderBy: { order_count: 'desc' },
        take: 6,
        select: { id: true, name: true, image: true, order_count: true },
      }),
      prisma.food.findMany({
        where: { ...foodZoneWhere, avg_rating: { gt: 0 } },
        orderBy: [{ avg_rating: 'desc' }, { rating_count: 'desc' }],
        take: 6,
        select: {
          id: true,
          name: true,
          image: true,
          avg_rating: true,
          rating_count: true,
        },
      }),
      prisma.delivery_men.findMany({
        where: {
          type: 'zone_wise',
          ...(zoneId === 'all' ? {} : { zone_id: zoneId }),
        },
        orderBy: { order_count: 'desc' },
        take: 6,
        select: { id: true, f_name: true, l_name: true, image: true, order_count: true },
      }),
      prisma.restaurants.findMany({
        where: restaurantsZoneWhere(zoneId),
        orderBy: { order_count: 'desc' },
        take: 6,
        select: { id: true, name: true, logo: true, order_count: true },
      }),
    ]);

  const popularRestaurantIds = wishlistGroups
    .map((g) => g.restaurant_id)
    .filter((id): id is NonNullable<typeof id> => id != null)
    .map((id) => Number(id));

  const popularRestaurantsMeta =
    popularRestaurantIds.length === 0
      ? []
      : await prisma.restaurants.findMany({
          where: { id: { in: popularRestaurantIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true, logo: true },
        });

  const restaurantById = new Map(popularRestaurantsMeta.map((r) => [Number(r.id), r]));

  const popularRestaurants = wishlistGroups
    .filter((g) => g.restaurant_id != null)
    .map((g) => {
      const id = Number(g.restaurant_id);
      const meta = restaurantById.get(id);
      return {
        id,
        name: meta?.name ?? 'Restaurant',
        count: g._count.restaurant_id,
        logo: publicRestaurantMediaUrl(meta?.logo, 'logo'),
      };
    });

  return {
    popularRestaurants,
    topSellingFoods: topSellingRows.map((row) => ({
      id: Number(row.id),
      name: row.name ?? '',
      sold: Number(row.order_count),
      image: mapFoodImage(row.image),
    })),
    topRatedFoods: topRatedRows.map((row) => ({
      id: Number(row.id),
      name: row.name ?? '',
      rating: Math.round(row.avg_rating * 10) / 10,
      reviews: Number(row.rating_count),
      image: mapFoodImage(row.image),
    })),
    topDeliveryman: topDmRows.map((row) => ({
      id: Number(row.id),
      name: dmDisplayName(row),
      orders: Number(row.order_count),
      image: mapDeliveryManImage(row.image),
    })),
    topRestaurants: topRestaurantRows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      orders: Number(row.order_count),
      logo: publicRestaurantMediaUrl(row.logo, 'logo'),
    })),
  };
}
