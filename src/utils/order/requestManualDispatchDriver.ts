import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { getBusinessSetting } from '../deliveryman/orderHelpers';
import { sendOrderNotification } from '../notifications/sendOrderNotification';
import { notifyManualDispatchDriverPool } from '../notifications/manualDispatchPush';
import { emitManualDispatchOrderRequest } from '../../sockets/orderRealtime';
import { manualDispatchGizraCharge } from './manualDispatchMoney';
import { mapOrderIdentityFields, resolveRestaurantOrderRefFromBody } from './orderIdentity';
import { readManualDispatch } from '../vendor/restaurantSetup/manualDispatch';

export type ManualDispatchRequestBody = {
  customer_name: string;
  customer_phone: string;
  address: string;
  order_amount: number;
  delivery_fee: number;
  payment_method?: 'prepaid' | 'cash_on_delivery';
  idempotency_key: string;
  zone_id?: number;
  latitude?: number;
  longitude?: number;
  tax?: number;
  restaurant_order_ref?: string;
  restaurant_order_number?: string;
  pos_order_number?: string;
  pos_order_id?: string;
  external_order_id?: string;
};

async function allowedManualDispatchRestaurants(): Promise<number[]> {
  const raw = (await getBusinessSetting('manual_dispatch_restaurants')) ?? '';
  const ids: number[] = [];
  for (const part of raw.split(',')) {
    const id = Number(part.trim());
    if (Number.isFinite(id) && id > 0) ids.push(id);
  }
  return ids;
}

async function walkInCustomer(restaurantId: number) {
  const email = `walkin+restaurant${restaurantId}@gizra.app`;
  const existing = await prisma.users.findFirst({ where: { email } });
  if (existing) return existing;

  const phone = `+00000000${String(restaurantId).padStart(3, '0').slice(-3)}`;
  return prisma.users.create({
    data: {
      email,
      f_name: 'Walk-in',
      l_name: 'Customer',
      password: await bcrypt.hash(`walkin-${restaurantId}-${Date.now()}`, 10),
      phone,
      status: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
}

function dispatchSummary(
  order: {
    id: bigint;
    is_manual_dispatch: boolean;
    order_type: string;
    restaurant_order_ref: string | null;
    order_amount: unknown;
    original_delivery_charge: unknown;
    delivery_charge: unknown;
    total_tax_amount: unknown;
    additional_charge: unknown;
    extra_packaging_amount: unknown;
    dm_tips: unknown;
    coupon_discount_amount: unknown;
    restaurant_discount_amount: unknown;
    ref_bonus_amount: unknown;
    payment_status: string | null;
  },
  commissionRate: number
) {
  const { commission, delivery_fee, gizra_charge } = manualDispatchGizraCharge(
    order as Parameters<typeof manualDispatchGizraCharge>[0],
    commissionRate
  );

  return {
    ...mapOrderIdentityFields(order),
    order_id: order.id.toString(),
    commission_rate: commissionRate,
    commission,
    delivery_fee,
    gizra_charge,
    restaurant_net: Math.round(-1 * gizra_charge * 100) / 100,
    payment_status: order.payment_status,
    message: 'Driver requested successfully',
    note:
      'Restaurant collected payment at store. Gizra commission (on food subtotal) plus full delivery fee are owed to the platform.',
  };
}

export type RequestManualDispatchOptions = {
  /** When false (admin), manual_dispatch toggle on the restaurant is not required. */
  requireManualDispatchEnabled?: boolean;
};

export type RequestManualDispatchResult =
  | { ok: true; status: 200; msg: string; data: ReturnType<typeof dispatchSummary> }
  | { ok: false; status: number; msg: string };

/**
 * Creates a manual-dispatch delivery order and notifies drivers (FCM + socket).
 */
export async function requestManualDispatchDriver(
  restaurantId: number,
  body: ManualDispatchRequestBody,
  options: RequestManualDispatchOptions = {}
): Promise<RequestManualDispatchResult> {
  const requireEnabled = options.requireManualDispatchEnabled !== false;

  try {
    const restaurant = await prisma.restaurants.findUnique({
      where: { id: BigInt(restaurantId) },
      select: {
        id: true,
        zone_id: true,
        latitude: true,
        longitude: true,
        vendor_id: true,
      },
    });

    if (!restaurant) {
      return { ok: false, status: 404, msg: 'Restaurant not found' };
    }

    if (requireEnabled) {
      const manualDispatch = await readManualDispatch(restaurant.id);
      const allowList = await allowedManualDispatchRestaurants();
      const restaurantIdNum = Number(restaurant.id);

      if (!manualDispatch && !allowList.includes(restaurantIdNum)) {
        return {
          ok: false,
          status: 403,
          msg: 'Manual driver dispatch is not enabled for this restaurant.',
        };
      }
    }

    const existing = await prisma.orders.findFirst({
      where: { manual_dispatch_key: body.idempotency_key },
    });
    if (existing) {
      const rate =
        Number(await getBusinessSetting('manual_dispatch_commission')) || 10;
      return {
        ok: true,
        status: 200,
        msg: 'Driver requested successfully',
        data: dispatchSummary(existing, rate),
      };
    }

    const customer = await walkInCustomer(restaurantId);
    const itemPrice = body.order_amount;
    const deliveryFee = body.delivery_fee;
    /** No VAT on food for manual dispatch — customer total is food + delivery only. */
    const taxAmount = 0;
    const orderTotal = Math.round((itemPrice + deliveryFee) * 100) / 100;
    const prepaid = body.payment_method === 'prepaid';
    const now = new Date();
    const zoneId = restaurant.zone_id != null ? Number(restaurant.zone_id) : null;
    const restaurantOrderRef = resolveRestaurantOrderRefFromBody(body);

    const order = await prisma.orders.create({
      data: {
        user_id: new Prisma.Decimal(Number(customer.id)),
        restaurant_id: new Prisma.Decimal(Number(restaurant.id)),
        order_type: 'delivery',
        order_status: 'confirmed',
        pending: now,
        confirmed: now,
        accepted: now,
        schedule_at: now,
        order_amount: orderTotal,
        delivery_charge: deliveryFee,
        original_delivery_charge: deliveryFee,
        total_tax_amount: taxAmount,
        restaurant_discount_amount: 0,
        coupon_discount_amount: 0,
        dm_tips: 0,
        extra_packaging_amount: 0,
        additional_charge: 0,
        ref_bonus_amount: 0,
        payment_method: 'cash_on_delivery',
        payment_status: prepaid ? 'paid' : 'unpaid',
        zone_id: zoneId != null ? zoneId : undefined,
        delivery_address: JSON.stringify({
          contact_person_name: body.customer_name,
          contact_person_number: body.customer_phone,
          address: body.address,
          address_type: 'others',
          latitude: String(body.latitude ?? restaurant.latitude ?? ''),
          longitude: String(body.longitude ?? restaurant.longitude ?? ''),
        }),
        is_manual_dispatch: true,
        manual_dispatch_key: body.idempotency_key,
        restaurant_order_ref: restaurantOrderRef,
        order_note: 'Manual dispatch - phone order',
        checked: false,
        created_at: now,
        updated_at: now,
      },
    });

    const rate = Number(await getBusinessSetting('manual_dispatch_commission')) || 10;

    void (async () => {
      try {
        await Promise.all([
          sendOrderNotification(order),
          notifyManualDispatchDriverPool(order),
          emitManualDispatchOrderRequest(order),
        ]);
      } catch (notifyErr) {
        console.error('[dispatch] notification failed', notifyErr);
      }
    })();

    return {
      ok: true,
      status: 200,
      msg: 'Driver requested successfully',
      data: dispatchSummary(order, rate),
    };
  } catch (error: unknown) {
    console.error('[dispatch] requestManualDispatchDriver failed', error);
    return { ok: false, status: 403, msg: 'Could not create the dispatch order.' };
  }
}
