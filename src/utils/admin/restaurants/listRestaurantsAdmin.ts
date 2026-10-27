import prisma from '../../../config/database';
import { publicRestaurantMediaUrl } from '../../mediaStorage';
import { buildRestaurantsAdminWhere } from './buildRestaurantsAdminWhere';

export type ListRestaurantsQuery = {
  search?: string;
  zone_id?: number | 'all';
  cuisine_id?: number | 'all';
  type?: string;
  restaurant_model?: string;
  active_only?: string;
  page?: number;
  limit?: number;
  vendorApprovedOnly?: boolean;
  vendorPendingOnly?: boolean;
  vendorDeniedOnly?: boolean;
};

function aggregateReviews(
  rows: { restaurant_id: unknown; rating: bigint | null }[]
): Map<number, { count: number; avg: number }> {
  const map = new Map<number, { sum: number; count: number }>();
  for (const row of rows) {
    const rid = row.restaurant_id != null ? Number(row.restaurant_id) : null;
    if (rid == null || !Number.isFinite(rid)) continue;
    const entry = map.get(rid) ?? { sum: 0, count: 0 };
    entry.sum += Number(row.rating ?? 0);
    entry.count += 1;
    map.set(rid, entry);
  }
  const out = new Map<number, { count: number; avg: number }>();
  for (const [rid, { sum, count }] of map) {
    out.set(rid, { count, avg: count ? Math.round((sum / count) * 10) / 10 : 0 });
  }
  return out;
}

export async function listRestaurantsAdmin(query: ListRestaurantsQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 15;
  const skip = (page - 1) * limit;

  const where = await buildRestaurantsAdminWhere(query, { statusMode: 'list' });

  const [total, rows] = await Promise.all([
    prisma.restaurants.count({ where }),
    prisma.restaurants.findMany({
      where,
      orderBy: { id: 'desc' },
      skip,
      take: limit,
    }),
  ]);

  const vendorIds = [...new Set(rows.map((r) => Number(r.vendor_id)).filter(Number.isFinite))];
  const vendors =
    vendorIds.length > 0
      ? await prisma.vendors.findMany({
          where: { id: { in: vendorIds.map((id) => BigInt(id)) } },
          select: { id: true, f_name: true, l_name: true, email: true, phone: true, status: true },
        })
      : [];
  const vendorById = new Map(vendors.map((v) => [Number(v.id), v]));

  const restaurantIds = rows.map((r) => Number(r.id));
  const cuisineLinks =
    restaurantIds.length > 0
      ? await prisma.cuisine_restaurant.findMany({
          where: { restaurant_id: { in: restaurantIds } },
          select: { restaurant_id: true, cuisine_id: true },
        })
      : [];
  const cuisinesByRestaurant = new Map<number, number[]>();
  const allCuisineIds = new Set<number>();
  for (const link of cuisineLinks) {
    const rid = Number(link.restaurant_id);
    const cid = Number(link.cuisine_id);
    allCuisineIds.add(cid);
    const list = cuisinesByRestaurant.get(rid) ?? [];
    list.push(cid);
    cuisinesByRestaurant.set(rid, list);
  }

  const cuisineRows =
    allCuisineIds.size > 0
      ? await prisma.cuisines.findMany({
          where: { id: { in: [...allCuisineIds].map((id) => BigInt(id)) } },
          select: { id: true, name: true },
        })
      : [];
  const cuisineNameById = new Map(cuisineRows.map((c) => [Number(c.id), c.name]));

  const reviewRows =
    restaurantIds.length > 0
      ? await prisma.reviews.findMany({
          where: {
            restaurant_id: { in: restaurantIds.map((id) => id) },
            OR: [{ status: true }, { status: null }],
          },
          select: { restaurant_id: true, rating: true },
        })
      : [];
  const reviewsByRestaurant = aggregateReviews(reviewRows);

  const zoneIds = [...new Set(rows.map((r) => (r.zone_id != null ? Number(r.zone_id) : null)).filter(Boolean))] as number[];
  const zones =
    zoneIds.length > 0
      ? await prisma.zones.findMany({
          where: { id: { in: zoneIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true },
        })
      : [];
  const zoneNameById = new Map(zones.map((z) => [Number(z.id), z.name]));

  const data = rows.map((r) => {
    const rid = Number(r.id);
    const cuisineIds = cuisinesByRestaurant.get(rid) ?? [];
    const cuisines = cuisineIds.map((id) => ({
      id,
      name: cuisineNameById.get(id) ?? '',
    }));
    const reviewStats = reviewsByRestaurant.get(rid) ?? { count: 0, avg: 0 };

    return {
      id: rid,
      name: r.name,
      phone: r.phone,
      email: r.email,
      zone_id: r.zone_id != null ? Number(r.zone_id) : null,
      zone_name: r.zone_id != null ? zoneNameById.get(Number(r.zone_id)) ?? null : null,
      status: r.status,
      active: r.active,
      restaurant_model: r.restaurant_model,
      logo: publicRestaurantMediaUrl(r.logo, 'logo'),
      cover_photo: publicRestaurantMediaUrl(r.cover_photo, 'cover'),
      cuisines,
      cuisine_ids: cuisineIds,
      rating: reviewStats.avg,
      reviews_count: reviewStats.count,
      vendor: (() => {
        const v = vendorById.get(Number(r.vendor_id));
        if (!v) return null;
        return {
          id: Number(v.id),
          f_name: v.f_name,
          l_name: v.l_name,
          email: v.email,
          phone: v.phone,
          status: v.status,
        };
      })(),
    };
  });

  return { data, total, page, limit };
}
