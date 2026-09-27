import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { orders } from '@prisma/client';
import { mapOrderSummary } from './mapper';
import { CustomerWithId, findCustomerForOrder } from './customers';

export const POS_HISTORY_STATUSES = [
  'all',
  'delivered',
  'refunded',
  'canceled',
  'failed',
  'pending',
  'handover',
] as const;

export type PosHistoryStatus = (typeof POS_HISTORY_STATUSES)[number];

export type PosHistorySource = 'online' | 'manual';

const HISTORY_STATUSES_ALL: string[] = [
  'delivered',
  'refunded',
  'refund_requested',
  'canceled',
  'failed',
];

export function buildPosHistoryStatusFilter(
  status: PosHistoryStatus,
  source: PosHistorySource
): Prisma.ordersWhereInput {
  if (status === 'all') {
    if (source === 'manual') {
      return {};
    }
    return { order_status: { in: HISTORY_STATUSES_ALL } };
  }
  if (status === 'failed') {
    return { order_status: 'failed' };
  }
  if (status === 'canceled') {
    return { order_status: 'canceled' };
  }
  return { order_status: status };
}

export function buildPosHistorySourceFilter(source: PosHistorySource): Prisma.ordersWhereInput {
  return source === 'manual' ? { is_manual_dispatch: true } : { is_manual_dispatch: false };
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? 6 : day - 1;
  x.setDate(x.getDate() - diff);
  return x;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export async function countPosHistorySummary(
  restaurantId: number,
  source: PosHistorySource
): Promise<{ today: number; this_week: number; this_month: number }> {
  const now = new Date();
  const base = {
    restaurant_id: restaurantId,
    order_type: { not: 'pos' },
    ...buildPosHistorySourceFilter(source),
    order_status: { in: HISTORY_STATUSES_ALL },
  };

  const [today, this_week, this_month] = await Promise.all([
    prisma.orders.count({
      where: { ...base, created_at: { gte: startOfDay(now) } },
    }),
    prisma.orders.count({
      where: { ...base, created_at: { gte: startOfWeek(now) } },
    }),
    prisma.orders.count({
      where: { ...base, created_at: { gte: startOfMonth(now) } },
    }),
  ]);

  return { today, this_week, this_month };
}

export function applyPosHistorySearch(
  where: Prisma.ordersWhereInput,
  search?: string
): Prisma.ordersWhereInput {
  const q = search?.trim();
  if (!q) return where;

  const idNum = Number(q);
  if (!Number.isNaN(idNum) && String(idNum) === q.replace(/^#/, '')) {
    return { ...where, id: BigInt(idNum) };
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(q);
  if (dateMatch) {
    const start = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { ...where, created_at: { gte: start, lt: end } };
  }

  return where;
}

export function posStatusLabel(orderStatus: string | null): string {
  switch (orderStatus) {
    case 'handover':
      return 'Ready for Handover';
    case 'canceled':
      return 'Cancelled';
    case 'failed':
      return 'Failed';
    case 'refunded':
      return 'Refunded';
    case 'delivered':
      return 'Delivered';
    case 'pending':
      return 'Pending';
    default:
      return orderStatus ?? 'Unknown';
  }
}

type LinePreview = {
  items_count: number;
  preview_item_name: string | null;
  preview_item_image: string | null;
};

export async function loadLinePreviewsForOrders(orderIds: bigint[]): Promise<Map<string, LinePreview>> {
  const map = new Map<string, LinePreview>();
  if (!orderIds.length) return map;

  const details = await prisma.order_details.findMany({
    where: { order_id: { in: orderIds.map((id) => Number(id)) } },
    orderBy: { id: 'asc' },
  });

  const byOrder = new Map<number, typeof details>();
  for (const row of details) {
    const oid = Number(row.order_id);
    if (!byOrder.has(oid)) byOrder.set(oid, []);
    byOrder.get(oid)!.push(row);
  }

  const foodIds = [...new Set(details.map((d) => Number(d.food_id)).filter(Boolean))];
  const foods =
    foodIds.length > 0
      ? await prisma.food.findMany({
          where: { id: { in: foodIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true, image: true },
        })
      : [];

  for (const orderId of orderIds) {
    const lines = byOrder.get(Number(orderId)) ?? [];
    const items_count = lines.reduce((sum, l) => sum + Number(l.quantity || 0), 0);
    const first = lines[0];
    const foodRow = first ? foods.find((f) => Number(f.id) === Number(first.food_id)) : null;
    map.set(orderId.toString(), {
      items_count,
      preview_item_name: foodRow?.name ?? (lines.length ? 'Order items' : null),
      preview_item_image: foodRow?.image ?? null,
    });
  }

  return map;
}

export async function mapPosHistoryOrders(
  orders: orders[],
  customers: CustomerWithId[]
): Promise<Record<string, unknown>[]> {
  const previews = await loadLinePreviewsForOrders(orders.map((o) => o.id));
  return orders.map((order) => {
    const preview = previews.get(order.id.toString()) ?? {
      items_count: 0,
      preview_item_name: null,
      preview_item_image: null,
    };
    return {
      ...mapOrderSummary(order, findCustomerForOrder(order, customers)),
      status_label: posStatusLabel(order.order_status),
      items_count: preview.items_count,
      preview_item_name: preview.preview_item_name,
      preview_item_image: preview.preview_item_image,
      is_manual_dispatch: order.is_manual_dispatch,
    };
  });
}
