import { order_transactions, orders, Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { parseFoodImageFromDetail } from '../consumer/orderListHelpers';
import { endOfDay, startOfDay, startOfMonth, startOfWeek } from './periodBounds';

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function deliveryEarningFromTxn(row: {
  original_delivery_charge: unknown;
  dm_tips: unknown;
  delivery_fee_comission?: unknown;
}): number {
  const fee = Number(row.original_delivery_charge) || 0;
  const tips = Number(row.dm_tips) || 0;
  return roundMoney(fee + tips);
}

export function deliveryEarningFromOrder(order: orders): number {
  const fee =
    Number(order.original_delivery_charge) || Number(order.delivery_charge) || 0;
  const tips = Number(order.dm_tips) || 0;
  return roundMoney(fee + tips);
}

async function sumEarningsInRange(
  dmId: Prisma.Decimal,
  from: Date,
  to?: Date
): Promise<number> {
  const created_at = to ? { gte: from, lt: to } : { gte: from };
  const agg = await prisma.order_transactions.aggregate({
    where: { delivery_man_id: dmId, created_at },
    _sum: { original_delivery_charge: true, dm_tips: true },
  });
  return roundMoney(
    Number(agg._sum.original_delivery_charge ?? 0) + Number(agg._sum.dm_tips ?? 0)
  );
}

export type DeliveryManEarningsSummary = {
  wallet: {
    total_earning: number;
    total_withdrawn: number;
    pending_withdraw: number;
    collected_cash: number;
    balance: number;
  };
  todays_earning: number;
  this_week_earning: number;
  this_month_earning: number;
  lifetime_earning: number;
};

export async function getDeliveryManEarningsSummary(
  deliveryManId: number
): Promise<DeliveryManEarningsSummary> {
  const dmId = new Prisma.Decimal(deliveryManId);
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekStart = startOfWeek(now);
  const monthStart = startOfMonth(now);

  const [wallet, todays_earning, this_week_earning, this_month_earning, lifetimeAgg] =
    await Promise.all([
      prisma.delivery_man_wallets.findFirst({
        where: { delivery_man_id: dmId },
      }),
      sumEarningsInRange(dmId, todayStart, todayEnd),
      sumEarningsInRange(dmId, weekStart),
      sumEarningsInRange(dmId, monthStart),
      prisma.order_transactions.aggregate({
        where: { delivery_man_id: dmId },
        _sum: { original_delivery_charge: true, dm_tips: true },
      }),
    ]);

  const total_earning = Number(wallet?.total_earning ?? 0);
  const total_withdrawn = Number(wallet?.total_withdrawn ?? 0);
  const pending_withdraw = Number(wallet?.pending_withdraw ?? 0);
  const collected_cash = Number(wallet?.collected_cash ?? 0);

  const lifetime_earning = roundMoney(
    Number(lifetimeAgg._sum.original_delivery_charge ?? 0) +
      Number(lifetimeAgg._sum.dm_tips ?? 0)
  );

  return {
    wallet: {
      total_earning: roundMoney(total_earning),
      total_withdrawn: roundMoney(total_withdrawn),
      pending_withdraw: roundMoney(pending_withdraw),
      collected_cash: roundMoney(collected_cash),
      balance: roundMoney(total_earning - total_withdrawn),
    },
    todays_earning,
    this_week_earning,
    this_month_earning,
    lifetime_earning,
  };
}

export type DeliveryManEarningHistoryItem = {
  id: string;
  source: 'order_transaction' | 'delivered_order';
  order_id: string;
  transaction_id: string | null;
  earned_at: string | null;
  delivery_fee: number;
  dm_tips: number;
  total_earning: number;
  order_amount: number;
  payment_method: string | null;
  payment_status: string | null;
  order_status: string;
  restaurant_id: string | null;
  restaurant_name: string | null;
  restaurant_logo: string | null;
  item_name: string | null;
  item_count: number;
  image: string | null;
  order: {
    id: string;
    order_status: string;
    order_amount: number;
    delivery_charge: number;
    original_delivery_charge: number;
    dm_tips: number;
    payment_method: string | null;
    payment_status: string;
    delivered_at: string | null;
    created_at: string | null;
    delivery_address: string | null;
    distance: number | null;
    items: Array<{
      id: string;
      food_id: string | null;
      name: string | null;
      quantity: number;
      price: number;
      image: string | null;
    }>;
  };
};

type OrderDetailRow = Awaited<
  ReturnType<typeof prisma.order_details.findMany>
>[number];

async function loadOrderEnrichment(orderIds: number[]) {
  const empty = {
    restaurants: new Map<number, { name: string; logo: string | null }>(),
    detailsByOrder: new Map<number, OrderDetailRow[]>(),
    ordersById: new Map<number, orders>(),
  };
  if (orderIds.length === 0) return empty;

  const ordersList = await prisma.orders.findMany({
    where: { id: { in: orderIds.map((id) => BigInt(id)) } },
  });
  const restaurantIds = [
    ...new Set(ordersList.map((o) => Number(o.restaurant_id)).filter(Boolean)),
  ];
  const restaurants = await prisma.restaurants.findMany({
    where: { id: { in: restaurantIds.map((id) => BigInt(id)) } },
    select: { id: true, name: true, logo: true },
  });
  const details = await prisma.order_details.findMany({
    where: { order_id: { in: orderIds } },
    orderBy: { id: 'asc' },
  });

  return {
    restaurants: new Map(
      restaurants.map((r) => [Number(r.id), { name: r.name, logo: r.logo }])
    ),
    detailsByOrder: details.reduce((map, row) => {
      const oid = Number(row.order_id);
      if (!map.has(oid)) map.set(oid, []);
      map.get(oid)!.push(row);
      return map;
    }, new Map<number, OrderDetailRow[]>()),
    ordersById: new Map(ordersList.map((o) => [Number(o.id), o])),
  };
}

function parseItemFromDetail(row: {
  food_details: string | null;
  food_id: unknown;
  quantity: unknown;
  price: unknown;
  id: bigint;
}): {
  id: string;
  food_id: string | null;
  name: string | null;
  quantity: number;
  price: number;
  image: string | null;
} {
  let name: string | null = null;
  let image = parseFoodImageFromDetail(row);
  if (row.food_details) {
    try {
      const parsed = JSON.parse(row.food_details) as { name?: string; image?: string };
      if (parsed.name) name = String(parsed.name);
      if (!image && parsed.image) image = String(parsed.image);
    } catch {
      /* ignore */
    }
  }
  return {
    id: row.id.toString(),
    food_id: row.food_id != null ? String(row.food_id) : null,
    name,
    quantity: Number(row.quantity) || 1,
    price: Number(row.price) || 0,
    image,
  };
}

function buildHistoryItem(
  order: orders,
  ctx: Awaited<ReturnType<typeof loadOrderEnrichment>>,
  txn: order_transactions | null,
  source: 'order_transaction' | 'delivered_order'
): DeliveryManEarningHistoryItem {
  const oid = Number(order.id);
  const restaurant = ctx.restaurants.get(Number(order.restaurant_id));
  const detailRows = ctx.detailsByOrder.get(oid) ?? [];
  const items = detailRows.map(parseItemFromDetail);
  const item_count = items.reduce((s, i) => s + i.quantity, 0);
  const firstItem = items[0];

  const delivery_fee = txn
    ? Number(txn.original_delivery_charge) || 0
    : Number(order.original_delivery_charge) || Number(order.delivery_charge) || 0;
  const dm_tips = txn ? Number(txn.dm_tips) || 0 : Number(order.dm_tips) || 0;
  const earnedAt = txn?.created_at ?? order.delivered ?? order.updated_at;

  return {
    id: txn ? txn.id.toString() : `order-${order.id}`,
    source,
    order_id: order.id.toString(),
    transaction_id: txn ? txn.id.toString() : null,
    earned_at: earnedAt?.toISOString() ?? null,
    delivery_fee: roundMoney(delivery_fee),
    dm_tips: roundMoney(dm_tips),
    total_earning: roundMoney(delivery_fee + dm_tips),
    order_amount: Number(order.order_amount) || 0,
    payment_method: order.payment_method,
    payment_status: order.payment_status,
    order_status: order.order_status,
    restaurant_id: order.restaurant_id != null ? String(order.restaurant_id) : null,
    restaurant_name: restaurant?.name ?? null,
    restaurant_logo: restaurant?.logo ?? null,
    item_name: firstItem?.name ?? restaurant?.name ?? null,
    item_count,
    image: firstItem?.image ?? restaurant?.logo ?? null,
    order: {
      id: order.id.toString(),
      order_status: order.order_status,
      order_amount: Number(order.order_amount) || 0,
      delivery_charge: Number(order.delivery_charge) || 0,
      original_delivery_charge:
        Number(order.original_delivery_charge) || Number(order.delivery_charge) || 0,
      dm_tips: Number(order.dm_tips) || 0,
      payment_method: order.payment_method,
      payment_status: order.payment_status,
      delivered_at: order.delivered?.toISOString() ?? null,
      created_at: order.created_at?.toISOString() ?? null,
      delivery_address: order.delivery_address,
      distance: order.distance ?? null,
      items,
    },
  };
}

export async function getDeliveryManEarningsHistory(
  deliveryManId: number,
  skip: number,
  take: number,
  search?: string
): Promise<{ total_size: number; history: DeliveryManEarningHistoryItem[] }> {
  const dmId = new Prisma.Decimal(deliveryManId);

  let txnWhere: Prisma.order_transactionsWhereInput = { delivery_man_id: dmId };
  if (search?.trim()) {
    const q = search.trim();
    if (/^\d+$/.test(q)) {
      txnWhere = { ...txnWhere, order_id: new Prisma.Decimal(q) };
    }
  }

  const txnTotal = await prisma.order_transactions.count({ where: txnWhere });

  if (txnTotal > 0) {
    const txns = await prisma.order_transactions.findMany({
      where: txnWhere,
      orderBy: { created_at: 'desc' },
      skip,
      take,
    });
    const orderIds = txns.map((t) => Number(t.order_id)).filter((id) => !Number.isNaN(id));
    const ctx = await loadOrderEnrichment(orderIds);
    const history = txns
      .map((txn) => {
        const order = ctx.ordersById.get(Number(txn.order_id));
        if (!order) return null;
        return buildHistoryItem(order, ctx, txn, 'order_transaction');
      })
      .filter((row): row is DeliveryManEarningHistoryItem => row != null);

    return { total_size: txnTotal, history };
  }

  let orderWhere: Prisma.ordersWhereInput = {
    delivery_man_id: dmId,
    order_status: 'delivered',
    order_type: { not: 'pos' },
  };
  if (search?.trim() && /^\d+$/.test(search.trim())) {
    orderWhere = { ...orderWhere, id: BigInt(search.trim()) };
  }

  const orderTotal = await prisma.orders.count({ where: orderWhere });
  const deliveredOrders = await prisma.orders.findMany({
    where: orderWhere,
    orderBy: [{ delivered: 'desc' }, { id: 'desc' }],
    skip,
    take,
  });

  const ctx = await loadOrderEnrichment(deliveredOrders.map((o) => Number(o.id)));
  const history = deliveredOrders.map((order) =>
    buildHistoryItem(order, ctx, null, 'delivered_order')
  );

  return { total_size: orderTotal, history };
}
