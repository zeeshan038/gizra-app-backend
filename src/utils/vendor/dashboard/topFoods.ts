import prisma from '../../../config/database';
import { publicMediaUrl } from '../../mediaStorage';

export type VendorDashboardFoodItem = {
  id: string;
  name: string;
  image: string | null;
  image_full_url: string | null;
  order_count: number;
  avg_rating: number;
  rating_count: number;
};

export type VendorDashboardTopFoods = {
  top_sell: VendorDashboardFoodItem[];
  most_rated_foods: VendorDashboardFoodItem[];
};

function mapFoodImage(stored: string | null | undefined): { image: string | null; image_full_url: string | null } {
  const image = stored?.trim() || null;
  if (!image) return { image: null, image_full_url: null };
  const path = image.includes('/') ? image : `product/${image}`;
  return { image, image_full_url: publicMediaUrl(path) };
}

function mapFoodRow(row: {
  id: bigint;
  name: string | null;
  image: string | null;
  order_count: bigint;
  avg_rating: number;
  rating_count: bigint;
}): VendorDashboardFoodItem {
  const media = mapFoodImage(row.image);
  return {
    id: row.id.toString(),
    name: row.name ?? '',
    ...media,
    order_count: Number(row.order_count),
    avg_rating: Math.round(row.avg_rating * 10) / 10,
    rating_count: Number(row.rating_count),
  };
}

/** Top selling & top rated — PHP Food::orderBy order_count / rating_count, take 6, restaurant scope. */
export async function getVendorDashboardTopFoods(restaurantId: number): Promise<VendorDashboardTopFoods> {
  const baseWhere = { restaurant_id: restaurantId };
  const select = {
    id: true,
    name: true,
    image: true,
    order_count: true,
    avg_rating: true,
    rating_count: true,
  } as const;

  const [top_sell, most_rated_foods] = await Promise.all([
    prisma.food.findMany({
      where: baseWhere,
      orderBy: { order_count: 'desc' },
      take: 6,
      select,
    }),
    prisma.food.findMany({
      where: baseWhere,
      orderBy: { rating_count: 'desc' },
      take: 6,
      select,
    }),
  ]);

  return {
    top_sell: top_sell.map(mapFoodRow),
    most_rated_foods: most_rated_foods.map(mapFoodRow),
  };
}
