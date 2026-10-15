import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { publicRestaurantMediaUrl } from '../../mediaStorage';

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

function buildTypeFilter(type?: string): Prisma.restaurantsWhereInput | undefined {
  if (!type || type === 'all') return undefined;
  switch (type) {
    case 'veg':
      return { veg: true };
    case 'non_veg':
      return { non_veg: true };
    case 'home_delivery':
      return { delivery: true };
    case 'take_away':
      return { take_away: true };
    case 'dine_in':
      return undefined;
    default:
      return undefined;
  }
}

function buildModelFilter(model?: string): Prisma.restaurantsWhereInput | undefined {
  if (!model || model === 'all' || model === '') return undefined;
  if (model === 'subscribed') return { restaurant_model: 'subscription' };
  return { restaurant_model: model };
}

export async function listRestaurantsAdmin(query: ListRestaurantsQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 15;
  const skip = (page - 1) * limit;

  const and: Prisma.restaurantsWhereInput[] = [];

  if (query.active_only !== '0') {
    and.push({ status: true });
  }

  if (query.vendorApprovedOnly) {
    const approved = await prisma.vendors.findMany({ where: { status: true }, select: { id: true } });
    and.push({ vendor_id: { in: approved.map((v) => Number(v.id)) } });
  } else if (query.vendorPendingOnly) {
    // App registration sets vendor.status = false until admin approves (Laravel: null = pending).
    const pending = await prisma.vendors.findMany({
      where: { NOT: { status: true } },
      select: { id: true },
    });
    const pendingIds = pending.map((v) => Number(v.id));
    if (pendingIds.length === 0) {
      return { data: [], total: 0, page, limit };
    }
    and.push({ vendor_id: { in: pendingIds } });
  } else if (query.vendorDeniedOnly) {
    const denied = await prisma.vendors.findMany({
      where: { status: false },
      select: { id: true },
    });
    const deniedIds = denied.map((v) => Number(v.id));
    if (deniedIds.length === 0) {
      return { data: [], total: 0, page, limit };
    }
    and.push({ vendor_id: { in: deniedIds } });
  } else {
    const approved = await prisma.vendors.findMany({ where: { status: true }, select: { id: true } });
    and.push({ vendor_id: { in: approved.map((v) => Number(v.id)) } });
  }

  if (query.zone_id && query.zone_id !== 'all') {
    and.push({ zone_id: query.zone_id });
  }

  if (query.cuisine_id && query.cuisine_id !== 'all') {
    const cuisineLinks = await prisma.cuisine_restaurant.findMany({
      where: { cuisine_id: query.cuisine_id },
      select: { restaurant_id: true },
    });
    and.push({
      id: { in: cuisineLinks.map((c) => BigInt(Number(c.restaurant_id))) },
    });
  }

  if (query.type === 'dine_in') {
    const dineInRows = await prisma.restaurant_configs.findMany({
      where: { dine_in: true },
      select: { restaurant_id: true },
    });
    and.push({ id: { in: dineInRows.map((d) => BigInt(Number(d.restaurant_id))) } });
  } else {
    const typeFilter = buildTypeFilter(query.type);
    if (typeFilter) and.push(typeFilter);
  }

  const modelFilter = buildModelFilter(query.restaurant_model);
  if (modelFilter) and.push(modelFilter);

  if (query.search?.trim()) {
    const tokens = query.search.trim().split(/\s+/).filter(Boolean);
    and.push({
      OR: tokens.flatMap((token) => [
        { name: { contains: token, mode: 'insensitive' } },
        { email: { contains: token, mode: 'insensitive' } },
        { phone: { contains: token, mode: 'insensitive' } },
        {
          vendors: {
            OR: [
              { f_name: { contains: token, mode: 'insensitive' } },
              { l_name: { contains: token, mode: 'insensitive' } },
              { email: { contains: token, mode: 'insensitive' } },
              { phone: { contains: token, mode: 'insensitive' } },
            ],
          },
        },
      ]),
    });
  }

  const where: Prisma.restaurantsWhereInput = and.length ? { AND: and } : {};

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
  for (const link of cuisineLinks) {
    const rid = Number(link.restaurant_id);
    const list = cuisinesByRestaurant.get(rid) ?? [];
    list.push(Number(link.cuisine_id));
    cuisinesByRestaurant.set(rid, list);
  }

  const zoneIds = [...new Set(rows.map((r) => (r.zone_id != null ? Number(r.zone_id) : null)).filter(Boolean))] as number[];
  const zones =
    zoneIds.length > 0
      ? await prisma.zones.findMany({
          where: { id: { in: zoneIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true },
        })
      : [];
  const zoneNameById = new Map(zones.map((z) => [Number(z.id), z.name]));

  const data = rows.map((r) => ({
    id: Number(r.id),
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
    cuisine_ids: cuisinesByRestaurant.get(Number(r.id)) ?? [],
  }));

  return { data, total, page, limit };
}
