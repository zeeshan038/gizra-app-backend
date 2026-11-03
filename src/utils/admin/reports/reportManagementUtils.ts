import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import {
  buildOrdersWhere,
  createdAtRange,
  ReportListQuery,
} from './reportQuery';

const REFUNDED_STATUSES = ['refunded_with_delivery_charge', 'refunded_without_delivery_charge'];

async function orderIdsMatching(query: ReportListQuery, extra?: Prisma.ordersWhereInput) {
  const where: Prisma.ordersWhereInput = {
    AND: [buildOrdersWhere(query), ...(extra ? [extra] : [])],
  };
  const rows = await prisma.orders.findMany({ where, select: { id: true } });
  return rows.map((r) => Number(r.id));
}

function num(v: unknown) {
  return Number(v ?? 0);
}

export async function transactionReportAdmin(query: ReportListQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const orderIds = await orderIdsMatching(query);
  const txnParts: Prisma.order_transactionsWhereInput[] = [];
  const range = createdAtRange(query.from, query.to);
  if (range) txnParts.push({ created_at: range });
  if (query.zone_id != null) txnParts.push({ zone_id: { equals: query.zone_id } });
  if (query.vendor_id != null) txnParts.push({ vendor_id: query.vendor_id });
  if (query.restaurant_id != null || query.customer_id != null || query.search?.trim()) {
    txnParts.push({ order_id: { in: orderIds.length ? orderIds : [-1] } });
  } else if (query.zone_id != null) {
    txnParts.push({ order_id: { in: orderIds.length ? orderIds : [-1] } });
  }
  const txnWhere: Prisma.order_transactionsWhereInput = txnParts.length ? { AND: txnParts } : {};

  const [agg, total, rows] = await Promise.all([
    prisma.order_transactions.aggregate({
      where: txnWhere,
      _sum: {
        admin_commission: true,
        restaurant_amount: true,
        original_delivery_charge: true,
        dm_tips: true,
        delivery_fee_comission: true,
      },
    }),
    prisma.order_transactions.count({ where: txnWhere }),
    prisma.order_transactions.findMany({
      where: txnWhere,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const adminEarned =
    rows.length === 0 && total === 0
      ? 0
      : await prisma.order_transactions
          .aggregate({
            where: {
              AND: [
                txnWhere,
                {
                  OR: [{ status: null }, { status: { notIn: REFUNDED_STATUSES } }],
                },
              ],
            },
            _sum: { admin_commission: true, delivery_fee_comission: true },
          })
          .then((r) => num(r._sum.admin_commission) + num(r._sum.delivery_fee_comission));

  const restaurantEarned = await prisma.order_transactions
    .aggregate({
      where: {
        AND: [
          txnWhere,
          { OR: [{ status: null }, { status: { notIn: REFUNDED_STATUSES } }] },
        ],
      },
      _sum: { restaurant_amount: true, tax: true },
    })
    .then((r) => num(r._sum.restaurant_amount) - num(r._sum.tax));

  const deliverymanEarned = num(agg._sum.original_delivery_charge) + num(agg._sum.dm_tips);

  const orderWhere = buildOrdersWhere(query);
  const orderAgg = await prisma.orders.aggregate({
    where: orderWhere,
    _sum: { order_amount: true },
  });

  return {
    summary: {
      admin_earned: adminEarned,
      restaurant_earned: restaurantEarned,
      deliveryman_earned: deliverymanEarned,
      delivered: num(orderAgg._sum.order_amount),
      canceled: 0,
    },
    data: rows.map((r) => ({
      id: r.id.toString(),
      order_id: String(r.order_id),
      order_amount: num(r.order_amount),
      restaurant_amount: num(r.restaurant_amount),
      admin_commission: num(r.admin_commission),
      delivery_charge: num(r.delivery_charge),
      status: r.status,
      created_at: r.created_at,
    })),
    total,
    page,
    limit,
  };
}

export async function expenseReportAdmin(
  query: ReportListQuery,
  createdBy: 'admin' | 'vendor' = 'admin'
) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const range = createdAtRange(query.from, query.to);
  const and: Prisma.expensesWhereInput[] = [{ created_by: createdBy }];
  if (range) and.push({ created_at: range });
  if (query.restaurant_id != null) and.push({ restaurant_id: query.restaurant_id });
  if (query.expense_type && query.expense_type !== 'all') {
    and.push({ type: query.expense_type });
  }
  if (query.search?.trim()) {
    const tokens = query.search.trim().split(/\s+/).filter(Boolean);
    and.push({
      OR: tokens.flatMap((t) => [
        { type: { contains: t, mode: 'insensitive' } },
        { order_id: Number(t) || undefined },
      ]),
    });
  }
  if (query.zone_id != null || query.customer_id != null) {
    const orderIds = await orderIdsMatching(query);
    and.push({
      OR: [
        orderIds.length ? { order_id: { in: orderIds.map((id) => id) } } : { id: BigInt(-1) },
        query.customer_id != null ? { user_id: query.customer_id } : {},
      ],
    });
  }

  const where = { AND: and };
  const [agg, total, rows] = await Promise.all([
    prisma.expenses.aggregate({ where, _sum: { amount: true } }),
    prisma.expenses.count({ where }),
    prisma.expenses.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    summary: { total_amount: num(agg._sum.amount) },
    data: rows.map((r) => ({
      id: r.id.toString(),
      type: r.type,
      amount: num(r.amount),
      order_id: r.order_id != null ? String(r.order_id) : null,
      description: r.description,
      created_at: r.created_at,
    })),
    total,
    page,
    limit,
  };
}

export async function orderReportAdmin(query: ReportListQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const where = buildOrdersWhere(query, { dateField: 'schedule_at' });
  const [total, rows, statusRows] = await Promise.all([
    prisma.orders.count({ where }),
    prisma.orders.findMany({
      where,
      orderBy: { schedule_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        order_status: true,
        order_amount: true,
        payment_status: true,
        schedule_at: true,
        created_at: true,
        restaurant_id: true,
        user_id: true,
      },
    }),
    prisma.orders.groupBy({
      by: ['order_status'],
      where,
      _count: { _all: true },
    }),
  ]);

  const statusMap = Object.fromEntries(statusRows.map((s) => [s.order_status, s._count._all]));

  const restaurantIds = [...new Set(rows.map((r) => Number(r.restaurant_id)))];
  const restaurants =
    restaurantIds.length > 0
      ? await prisma.restaurants.findMany({
          where: { id: { in: restaurantIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true },
        })
      : [];
  const restaurantMap = new Map(restaurants.map((r) => [Number(r.id), r.name]));

  return {
    summary: {
      delivered: statusMap.delivered ?? 0,
      canceled: statusMap.canceled ?? 0,
      pending: statusMap.pending ?? 0,
      processing: (statusMap.confirmed ?? 0) + (statusMap.processing ?? 0) + (statusMap.handover ?? 0),
      failed: statusMap.failed ?? 0,
      refunded: statusMap.refunded ?? 0,
    },
    data: rows.map((r) => ({
      id: String(r.id),
      order_id: String(r.id),
      status: r.order_status,
      amount: num(r.order_amount),
      payment_status: r.payment_status,
      restaurant: restaurantMap.get(Number(r.restaurant_id)) ?? null,
      date: r.schedule_at ?? r.created_at,
    })),
    total,
    page,
    limit,
  };
}

export async function campaignOrderReportAdmin(query: ReportListQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const detailWhere: Prisma.order_detailsWhereInput = {
    item_campaign_id: query.campaign_id != null ? query.campaign_id : { not: null },
  };
  const detailRows = await prisma.order_details.findMany({
    where: detailWhere,
    select: { order_id: true },
  });
  const campaignOrderIds = [
    ...new Set(detailRows.map((d) => (d.order_id != null ? Number(d.order_id) : null)).filter(Boolean)),
  ] as number[];
  if (!campaignOrderIds.length) {
    return { summary: { orders: 0 }, data: [], total: 0, page, limit };
  }
  const where: Prisma.ordersWhereInput = {
    AND: [buildOrdersWhere(query), { id: { in: campaignOrderIds.map((id) => BigInt(id)) } }],
  };
  const [total, rows] = await Promise.all([
    prisma.orders.count({ where }),
    prisma.orders.findMany({
      where,
      orderBy: { schedule_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        order_status: true,
        order_amount: true,
        schedule_at: true,
        created_at: true,
        restaurant_id: true,
      },
    }),
  ]);

  return {
    summary: { orders: total },
    data: rows.map((r) => ({
      id: String(r.id),
      order_id: String(r.id),
      status: r.order_status,
      amount: num(r.order_amount),
      date: r.schedule_at ?? r.created_at,
      restaurant_id: String(r.restaurant_id),
    })),
    total,
    page,
    limit,
  };
}

export async function foodWiseReportAdmin(query: ReportListQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const orderIds = await orderIdsMatching(query, {
    order_status: { in: ['delivered', 'refund_requested', 'refund_request_canceled'] },
  });

  if (!orderIds.length) {
    return { summary: { total_orders: 0, total_amount: 0 }, data: [], total: 0, page, limit };
  }

  const details = await prisma.order_details.findMany({
    where: { order_id: { in: orderIds.map((id) => id) }, food_id: { not: null } },
    select: { food_id: true, quantity: true, price: true },
  });

  const byFood = new Map<number, { orders: number; amount: number }>();
  for (const d of details) {
    const fid = Number(d.food_id);
    const cur = byFood.get(fid) ?? { orders: 0, amount: 0 };
    const qty = Number(d.quantity);
    cur.orders += qty;
    cur.amount += num(d.price) * qty;
    byFood.set(fid, cur);
  }

  const entries = [...byFood.entries()].sort((a, b) => b[1].amount - a[1].amount);
  const total = entries.length;
  const slice = entries.slice((page - 1) * limit, page * limit);
  const foodIds = slice.map(([id]) => BigInt(id));
  const foods =
    foodIds.length > 0
      ? await prisma.food.findMany({ where: { id: { in: foodIds } }, select: { id: true, name: true } })
      : [];
  const foodMap = new Map(foods.map((f) => [Number(f.id), f.name]));

  const totalAmount = entries.reduce((s, [, v]) => s + v.amount, 0);
  const totalOrders = entries.reduce((s, [, v]) => s + v.orders, 0);

  return {
    summary: { total_orders: totalOrders, total_amount: totalAmount },
    data: slice.map(([foodId, stats]) => ({
      id: String(foodId),
      food: foodMap.get(foodId) ?? `Food #${foodId}`,
      orders: stats.orders,
      amount: stats.amount,
    })),
    total,
    page,
    limit,
  };
}

export async function restaurantReportAdmin(query: ReportListQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const range = createdAtRange(query.from, query.to);
  const restaurantWhere: Prisma.restaurantsWhereInput = {};
  if (query.zone_id != null) restaurantWhere.zone_id = query.zone_id;
  if (query.search?.trim()) {
    restaurantWhere.name = { contains: query.search.trim(), mode: 'insensitive' };
  }

  const [total, restaurants] = await Promise.all([
    prisma.restaurants.count({ where: restaurantWhere }),
    prisma.restaurants.findMany({
      where: restaurantWhere,
      orderBy: { id: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, name: true, zone_id: true },
    }),
  ]);

  const ids = restaurants.map((r) => Number(r.id));
  const orderCounts = await Promise.all(
    ids.map(async (id) => {
      const count = await prisma.orders.count({
        where: {
          restaurant_id: id,
          ...(range ? { created_at: range } : {}),
          NOT: { order_type: 'pos' },
        },
      });
      return [id, count] as const;
    })
  );
  const countMap = new Map(orderCounts);

  return {
    summary: { restaurants: total },
    data: restaurants.map((r) => ({
      id: String(r.id),
      name: r.name,
      orders: countMap.get(Number(r.id)) ?? 0,
      zone_id: r.zone_id != null ? String(r.zone_id) : null,
    })),
    total,
    page,
    limit,
  };
}

export async function subscriptionReportAdmin(query: ReportListQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const range = createdAtRange(query.from, query.to);
  const where: Prisma.subscription_transactionsWhereInput = {
    ...(range ? { created_at: range } : {}),
    ...(query.restaurant_id != null ? { restaurant_id: query.restaurant_id } : {}),
  };

  const [agg, total, rows] = await Promise.all([
    prisma.subscription_transactions.aggregate({ where, _sum: { paid_amount: true }, _count: true }),
    prisma.subscription_transactions.count({ where }),
    prisma.subscription_transactions.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const packageIds = [...new Set(rows.map((r) => Number(r.package_id)))];
  const packages =
    packageIds.length > 0
      ? await prisma.subscription_packages.findMany({
          where: { id: { in: packageIds.map((id) => BigInt(id)) } },
          select: { id: true, package_name: true },
        })
      : [];
  const packageMap = new Map(packages.map((p) => [Number(p.id), p.package_name]));

  return {
    summary: {
      subscribers: agg._count,
      total_paid: num(agg._sum.paid_amount),
    },
    data: rows.map((r) => ({
      id: r.id,
      package: packageMap.get(Number(r.package_id)) ?? `Package #${r.package_id}`,
      restaurant_id: String(r.restaurant_id),
      paid_amount: num(r.paid_amount),
      payment_status: r.payment_status,
      created_at: r.created_at,
    })),
    total,
    page,
    limit,
  };
}

export async function disbursementReportAdmin(
  query: ReportListQuery,
  tab: 'restaurant' | 'delivery_man'
) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 25;
  const range = createdAtRange(query.from, query.to);
  const and: Prisma.disbursement_detailsWhereInput[] = [
    tab === 'restaurant' ? { restaurant_id: { not: null } } : { delivery_man_id: { not: null } },
  ];
  if (range) and.push({ created_at: range });
  if (tab === 'restaurant' && query.restaurant_id != null) {
    and.push({ restaurant_id: query.restaurant_id });
  }
  if (tab === 'delivery_man' && query.delivery_man_id != null) {
    and.push({ delivery_man_id: query.delivery_man_id });
  }
  if (query.status && query.status !== 'all') and.push({ status: query.status });
  if (query.payment_method_id != null) and.push({ payment_method: query.payment_method_id });

  const where = { AND: and };
  const [allRows, total, rows] = await Promise.all([
    prisma.disbursement_details.findMany({ where, select: { status: true, disbursement_amount: true } }),
    prisma.disbursement_details.count({ where }),
    prisma.disbursement_details.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  const sumBy = (status: string) =>
    allRows.filter((r) => r.status === status).reduce((s, r) => s + num(r.disbursement_amount), 0);

  const restaurantIds = rows
    .map((r) => (r.restaurant_id != null ? Number(r.restaurant_id) : null))
    .filter(Boolean) as number[];
  const dmIds = rows
    .map((r) => (r.delivery_man_id != null ? Number(r.delivery_man_id) : null))
    .filter(Boolean) as number[];

  const [restaurants, dms] = await Promise.all([
    restaurantIds.length
      ? prisma.restaurants.findMany({
          where: { id: { in: restaurantIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true },
        })
      : [],
    dmIds.length
      ? prisma.delivery_men.findMany({
          where: { id: { in: dmIds.map((id) => BigInt(id)) } },
          select: { id: true, f_name: true, l_name: true },
        })
      : [],
  ]);
  const restaurantMap = new Map(restaurants.map((r) => [Number(r.id), r.name]));
  const dmMap = new Map(
    dms.map((d) => [Number(d.id), [d.f_name, d.l_name].filter(Boolean).join(' ') || `DM #${d.id}`])
  );

  return {
    summary: {
      pending: sumBy('pending'),
      completed: sumBy('completed'),
      canceled: sumBy('canceled'),
    },
    data: rows.map((r) => ({
      id: r.id.toString(),
      disbursement_id: String(r.disbursement_id),
      amount: num(r.disbursement_amount),
      status: r.status,
      restaurant:
        r.restaurant_id != null ? restaurantMap.get(Number(r.restaurant_id)) ?? null : null,
      name:
        r.delivery_man_id != null ? dmMap.get(Number(r.delivery_man_id)) ?? null : null,
      created_at: r.created_at,
    })),
    total,
    page,
    limit,
  };
}
