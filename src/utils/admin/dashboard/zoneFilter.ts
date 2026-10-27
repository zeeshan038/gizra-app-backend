import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { AdminDashboardZoneId } from './types';

export function ordersZoneWhere(zoneId: AdminDashboardZoneId): Prisma.ordersWhereInput {
  if (zoneId === 'all') return {};
  return { zone_id: zoneId };
}

export function restaurantsZoneWhere(zoneId: AdminDashboardZoneId): Prisma.restaurantsWhereInput {
  if (zoneId === 'all') return {};
  return { zone_id: zoneId };
}

export function usersZoneWhere(zoneId: AdminDashboardZoneId): Prisma.usersWhereInput {
  if (zoneId === 'all') return {};
  return { zone_id: zoneId };
}

export function deliveryMenZoneWhere(zoneId: AdminDashboardZoneId): Prisma.delivery_menWhereInput {
  if (zoneId === 'all') return {};
  return { zone_id: zoneId };
}

/** Restaurant ids in zone — for tables without a Prisma relation to zones. */
export async function restaurantIdsForZone(zoneId: AdminDashboardZoneId): Promise<number[] | null> {
  if (zoneId === 'all') return null;
  const rows = await prisma.restaurants.findMany({
    where: { zone_id: zoneId },
    select: { id: true },
  });
  return rows.map((r) => Number(r.id));
}

export function parseAdminZoneId(raw: string | undefined): AdminDashboardZoneId | null {
  if (raw == null || raw === '' || raw === 'all') return 'all';
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}
