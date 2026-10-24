import prisma from '../../../config/database';
import type { ListRestaurantsQuery } from './listRestaurantsAdmin';
import { buildRestaurantsAdminWhere } from './buildRestaurantsAdminWhere';

export async function getRestaurantsAdminStats(query: ListRestaurantsQuery) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const baseQuery: ListRestaurantsQuery = {
    ...query,
    page: undefined,
    limit: undefined,
  };

  const [totalRestaurants, activeRestaurants, inactiveRestaurants, newlyJoined, txGlobal] =
    await Promise.all([
      prisma.restaurants.count({
        where: await buildRestaurantsAdminWhere(baseQuery, { statusMode: 'list' }),
      }),
      prisma.restaurants.count({
        where: await buildRestaurantsAdminWhere(baseQuery, { statusMode: 'active' }),
      }),
      prisma.restaurants.count({
        where: await buildRestaurantsAdminWhere(baseQuery, { statusMode: 'inactive' }),
      }),
      prisma.restaurants.count({
        where: await buildRestaurantsAdminWhere(baseQuery, {
          statusMode: 'any',
          createdAfter: thirtyDaysAgo,
        }),
      }),
      Promise.all([
        prisma.order_transactions.count(),
        prisma.admin_wallets.aggregate({ _sum: { total_commission_earning: true } }),
        prisma.withdraw_requests.aggregate({
          where: { approved: 1, vendor_id: { not: null } },
          _sum: { amount: true },
        }),
      ]),
    ]);

  const [totalTransactions, commissionAgg, withdrawAgg] = txGlobal;

  return {
    total_restaurants: totalRestaurants,
    active_restaurants: activeRestaurants,
    inactive_restaurants: inactiveRestaurants,
    newly_joined_restaurants: newlyJoined,
    total_transactions: totalTransactions,
    commission_earned: Number(commissionAgg._sum.total_commission_earning ?? 0),
    total_restaurant_withdraws: Number(withdrawAgg._sum.amount ?? 0),
  };
}
