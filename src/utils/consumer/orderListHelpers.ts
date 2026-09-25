import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { notPosWhere } from '../vendor/order/query';

/** Past orders tab (PHP `get_order_list`). */
export const HISTORY_ORDER_STATUSES = [
  'delivered',
  'canceled',
  'refund_requested',
  'refund_request_canceled',
  'refunded',
  'failed',
] as const;

export type ConsumerOrderListMode = 'running' | 'history' | 'subscription';

export function resolveConsumerOrderUser(
  req: Request,
  res: Response,
  guestIdFromQuery?: number
): { userId: number; isGuest: boolean } | null {
  if (req.user?.id) {
    return { userId: Number(req.user.id), isGuest: false };
  }
  if (guestIdFromQuery != null && Number.isFinite(guestIdFromQuery)) {
    return { userId: guestIdFromQuery, isGuest: true };
  }
  res.status(401).json({ status: false, msg: 'Unauthorized' });
  return null;
}

export function buildConsumerOrderListWhere(
  userId: number,
  isGuest: boolean,
  mode: ConsumerOrderListMode
): Prisma.ordersWhereInput {
  const base: Prisma.ordersWhereInput = {
    user_id: userId,
    is_guest: isGuest,
    ...notPosWhere,
  };

  if (mode === 'subscription') {
    return {
      ...base,
      subscription_id: { not: null },
    };
  }

  const withSubscription = {
    ...base,
    subscription_id: null,
  };

  if (mode === 'history') {
    return {
      ...withSubscription,
      order_status: { in: [...HISTORY_ORDER_STATUSES] },
    };
  }

  return {
    ...withSubscription,
    order_status: { notIn: [...HISTORY_ORDER_STATUSES] },
  };
}

/** Laravel paginate 4th arg — page number (1-based), not row skip. */
export function paginationSkip(limit: number, page: number): number {
  const safePage = Math.max(1, page);
  return (safePage - 1) * limit;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  accepted: 'Accepted',
  processing: 'Processing',
  handover: 'Handover',
  picked_up: 'On the way',
  delivered: 'Completed',
  canceled: 'Canceled',
  refund_requested: 'Refund requested',
  refund_request_canceled: 'Refund canceled',
  refunded: 'Refunded',
  failed: 'Failed',
};

export function orderStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

function formatOrderDateTime(createdAt: Date | null | undefined): {
  order_date: string | null;
  order_time: string | null;
} {
  if (!createdAt) return { order_date: null, order_time: null };
  const d = new Date(createdAt);
  const order_date = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const order_time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { order_date, order_time };
}

export function parseFoodImageFromDetail(detail: {
  food_details: string | null;
  food_id: unknown;
}): string | null {
  if (detail.food_details) {
    try {
      const parsed = JSON.parse(detail.food_details) as { image?: string };
      if (parsed?.image) return String(parsed.image);
    } catch {
      /* ignore */
    }
  }
  return null;
}

type OrderRow = {
  id: bigint;
  restaurant_id: unknown;
  order_amount: unknown;
  order_status: string;
  payment_status: string;
  created_at: Date | null;
};

type RestaurantRow = {
  id: bigint;
  name: string;
  logo: string | null;
};

/** Figma Orders tabs — card row. */
export function formatConsumerOrderListItem(
  order: OrderRow,
  restaurant: RestaurantRow | undefined,
  thumbImage: string | null,
  mode: ConsumerOrderListMode
): Record<string, unknown> {
  const { order_date, order_time } = formatOrderDateTime(order.created_at);
  const id = order.id.toString();

  return {
    id,
    order_id: id,
    order_number: id,
    restaurant_id: order.restaurant_id != null ? String(order.restaurant_id) : null,
    restaurant_name: restaurant?.name ?? 'Unknown',
    restaurant_logo: restaurant?.logo ?? 'default_logo.png',
    image: thumbImage ?? restaurant?.logo ?? 'default_logo.png',
    order_amount: Number(order.order_amount) || 0,
    order_status: order.order_status,
    status_label: orderStatusLabel(order.order_status),
    payment_status: order.payment_status,
    created_at: order.created_at,
    order_date,
    order_time,
    track_order: mode === 'running',
  };
}

/** Optional Figma search bar — order id or restaurant name. */
export async function applyOrderListSearchFilter(
  where: Prisma.ordersWhereInput,
  search: string | undefined,
  prismaClient: {
    restaurants: {
      findMany: (args: {
        where: { name: { contains: string; mode: 'insensitive' } };
        select: { id: true };
      }) => Promise<{ id: bigint }[]>;
    };
  }
): Promise<Prisma.ordersWhereInput> {
  const q = search?.trim();
  if (!q) return where;

  const ors: Prisma.ordersWhereInput[] = [];
  if (/^\d+$/.test(q)) {
    ors.push({ id: BigInt(q) });
  }

  const restaurantMatches = await prismaClient.restaurants.findMany({
    where: { name: { contains: q, mode: 'insensitive' } },
    select: { id: true },
  });
  if (restaurantMatches.length) {
    ors.push({
      restaurant_id: { in: restaurantMatches.map((r) => Number(r.id)) },
    });
  }

  if (!ors.length) {
    return { AND: [where, { id: BigInt(-1) }] };
  }

  return { AND: [where, { OR: ors }] };
}
