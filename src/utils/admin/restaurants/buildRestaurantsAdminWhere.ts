import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import type { ListRestaurantsQuery } from './listRestaurantsAdmin';

export type RestaurantStatusMode = 'list' | 'active' | 'inactive' | 'any';

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

export async function buildRestaurantsAdminWhere(
  query: ListRestaurantsQuery,
  options: {
    statusMode?: RestaurantStatusMode;
    createdAfter?: Date;
  } = {}
): Promise<Prisma.restaurantsWhereInput> {
  const statusMode = options.statusMode ?? 'list';
  const and: Prisma.restaurantsWhereInput[] = [];

  if (statusMode === 'list' && query.active_only !== '0') {
    and.push({ status: true });
  } else if (statusMode === 'active') {
    and.push({ status: true });
  } else if (statusMode === 'inactive') {
    and.push({ status: false });
  }

  if (options.createdAfter) {
    and.push({ created_at: { gte: options.createdAfter } });
  }

  if (query.vendorApprovedOnly) {
    const approved = await prisma.vendors.findMany({ where: { status: true }, select: { id: true } });
    and.push({ vendor_id: { in: approved.map((v) => Number(v.id)) } });
  } else if (query.vendorPendingOnly) {
    const pending = await prisma.vendors.findMany({
      where: { NOT: { status: true } },
      select: { id: true },
    });
    and.push({ vendor_id: { in: pending.map((v) => Number(v.id)) } });
  } else if (query.vendorDeniedOnly) {
    const denied = await prisma.vendors.findMany({
      where: { status: false },
      select: { id: true },
    });
    and.push({ vendor_id: { in: denied.map((v) => Number(v.id)) } });
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

  return and.length ? { AND: and } : {};
}
