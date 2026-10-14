import prisma from '../../../config/database';
import { resolveStatisticsDateRange } from './dateRanges';
import { AdminDashboardStatisticsType, AdminDashboardZoneId, AdminUserOverview } from './types';
import {
  deliveryMenZoneWhere,
  restaurantsZoneWhere,
  usersZoneWhere,
} from './zoneFilter';

/**
 * User overview pie chart — PHP `DashboardController::user_overview_calc()`.
 */
export async function getAdminDashboardUserOverview(
  zoneId: AdminDashboardZoneId,
  userOverview: AdminDashboardStatisticsType
): Promise<AdminUserOverview> {
  const createdRange = resolveStatisticsDateRange(userOverview);
  const createdAtFilter = createdRange ? { created_at: createdRange } : undefined;

  const approvedVendors = await prisma.vendors.findMany({
    where: { status: true },
    select: { id: true },
  });
  const approvedVendorIds = approvedVendors.map((v) => Number(v.id));

  const [customer, restaurant, delivery_man] = await Promise.all([
    prisma.users.count({
      where: {
        ...usersZoneWhere(zoneId),
        ...(createdAtFilter ?? {}),
      },
    }),
    prisma.restaurants.count({
      where: {
        ...restaurantsZoneWhere(zoneId),
        ...(createdAtFilter ?? {}),
        vendor_id: { in: approvedVendorIds },
      },
    }),
    prisma.delivery_men.count({
      where: {
        ...deliveryMenZoneWhere(zoneId),
        ...(createdAtFilter ?? {}),
        application_status: 'approved',
        type: 'zone_wise',
      },
    }),
  ]);

  return {
    customer,
    restaurant,
    delivery_man,
    total: customer + restaurant + delivery_man,
  };
}
