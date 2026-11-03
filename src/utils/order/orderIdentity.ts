import { orders } from '@prisma/client';

export type OrderSource = 'gizra_consumer' | 'manual_dispatch' | 'pos_instore';

export function resolveOrderSource(order: Pick<orders, 'is_manual_dispatch' | 'order_type'>): OrderSource {
  if (order.is_manual_dispatch) return 'manual_dispatch';
  if (order.order_type === 'pos') return 'pos_instore';
  return 'gizra_consumer';
}

export function orderSourceLabel(source: OrderSource): string {
  switch (source) {
    case 'manual_dispatch':
      return 'Gizra ride (restaurant request)';
    case 'pos_instore':
      return 'Restaurant POS';
    case 'gizra_consumer':
    default:
      return 'Gizra customer app';
  }
}

export function mapOrderIdentityFields(order: Pick<orders, 'id' | 'is_manual_dispatch' | 'order_type' | 'restaurant_order_ref'>) {
  const order_source = resolveOrderSource(order);
  const restaurant_order_ref = order.restaurant_order_ref?.trim() || null;
  const gizra_order_id = order.id.toString();

  return {
    order_source,
    order_source_label: orderSourceLabel(order_source),
    gizra_order_id,
    restaurant_order_ref,
    /** Primary label for driver list — POS ref when set, otherwise Gizra order id */
    display_order_number: restaurant_order_ref ?? gizra_order_id,
  };
}

export function normalizeRestaurantOrderRef(input: unknown): string | null {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  return s.slice(0, 100);
}

export function resolveRestaurantOrderRefFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  return (
    normalizeRestaurantOrderRef(b.restaurant_order_ref) ??
    normalizeRestaurantOrderRef(b.restaurant_order_number) ??
    normalizeRestaurantOrderRef(b.pos_order_number) ??
    normalizeRestaurantOrderRef(b.pos_order_id) ??
    normalizeRestaurantOrderRef(b.external_order_id)
  );
}

export type DriverOrderListCardIdentity = {
  is_manual_dispatch: boolean;
  order_id: string;
  order_source: OrderSource;
  order_source_label: string;
  gizra_order_id: string;
  restaurant_order_ref: string | null;
  restaurant_order_number: string | null;
  display_order_number: string;
  dispatch_summary?: {
    title: string;
    restaurant_order_ref: string | null;
    gizra_order_id: string;
  };
};

/** Shared identity block for GET /delivery-man/orders/latest and /active list cards. */
export function driverOrderListCardIdentity(
  order: Pick<orders, 'id' | 'is_manual_dispatch' | 'order_type' | 'restaurant_order_ref'>
): DriverOrderListCardIdentity {
  const identity = mapOrderIdentityFields(order);
  const base = {
    is_manual_dispatch: Boolean(order.is_manual_dispatch),
    /** Platform id — same as `id`; use for accept/status URLs. */
    order_id: identity.gizra_order_id,
    ...identity,
    /** Alias for restaurant POS id (matches request-driver body names). */
    restaurant_order_number: identity.restaurant_order_ref,
  };

  if (!order.is_manual_dispatch) {
    return base;
  }

  return {
    ...base,
    dispatch_summary: {
      title: 'Gizra ride — restaurant requested driver',
      restaurant_order_ref: identity.restaurant_order_ref,
      gizra_order_id: identity.gizra_order_id,
    },
  };
}

/** Extra FCM / inbox fields so driver apps can show the restaurant’s ticket without refetching. */
export function orderIdentityFcmFields(
  order: Pick<orders, 'id' | 'is_manual_dispatch' | 'order_type' | 'restaurant_order_ref'>
) {
  const identity = mapOrderIdentityFields(order);
  return {
    gizra_order_id: identity.gizra_order_id,
    display_order_number: identity.display_order_number,
    order_source: identity.order_source,
    is_manual_dispatch: String(Boolean(order.is_manual_dispatch)),
    ...(identity.restaurant_order_ref
      ? { restaurant_order_ref: identity.restaurant_order_ref }
      : {}),
  };
}
