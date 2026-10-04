import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { vendorRequestDriverSchema } from '../../schemas/vendor/dispatch';
import { getVendorContext } from '../../utils/vendor/context';
import { readManualDispatch } from '../../utils/vendor/restaurantSetup/manualDispatch';
import { getBusinessSetting } from '../../utils/deliveryman/orderHelpers';
import { sendOrderNotification } from '../../utils/notifications/sendOrderNotification';
import { notifyManualDispatchDriverPool } from '../../utils/notifications/manualDispatchPush';
import { emitManualDispatchOrderRequest } from '../../sockets/orderRealtime';

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
      phone,
      password: await bcrypt.hash(`walkin-${restaurantId}-${Date.now()}`, 10),
      status: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
}

function dispatchSummary(order: {
  id: bigint;
  order_amount: unknown;
  original_delivery_charge: unknown;
  payment_status: string | null;
}, commissionRate: number) {
  const orderAmount = Number(order.order_amount) || 0;
  const fee = Number(order.original_delivery_charge) || 0;
  const commission = Math.round((orderAmount * commissionRate) / 100 * 100) / 100;
  const gizraCharge = Math.round((commission + fee) * 100) / 100;

  return {
    order_id: order.id.toString(),
    commission_rate: commissionRate,
    commission,
    delivery_fee: fee,
    gizra_charge: gizraCharge,
    restaurant_net:
      order.payment_status === 'paid'
        ? Math.round(-1 * gizraCharge * 100) / 100
        : Math.round((orderAmount - commission - fee) * 100) / 100,
    payment_status: order.payment_status,
    message: 'Driver requested successfully',
  };
}

/**
 * Manual driver dispatch from POS (phone order) — mirrors PHP
 * POST /api/v1/vendor/dispatch/request-driver
 *
 * @Route POST /api/vendor/dispatch/request-driver
 * @Access Private (Vendor / POS JWT)
 */
export const requestDriver = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = vendorRequestDriverSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(403).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const body = validated.value as {
    customer_name: string;
    customer_phone: string;
    address: string;
    order_amount: number;
    delivery_fee: number;
    payment_method: 'prepaid' | 'cash_on_delivery';
    idempotency_key: string;
    zone_id?: number;
    latitude?: number;
    longitude?: number;
    tax?: number;
  };

  try {
    const restaurant = await prisma.restaurants.findUnique({
      where: { id: BigInt(ctx.restaurantId) },
      select: {
        id: true,
        zone_id: true,
        latitude: true,
        longitude: true,
        vendor_id: true,
      },
    });

    if (!restaurant) {
      return res.status(404).json({ status: false, msg: 'Restaurant not found' });
    }

    const manualDispatch = await readManualDispatch(restaurant.id);
    const allowList = await allowedManualDispatchRestaurants();
    const restaurantIdNum = Number(restaurant.id);

    if (!manualDispatch && !allowList.includes(restaurantIdNum)) {
      return res.status(403).json({
        status: false,
        msg: 'Manual driver dispatch is not enabled for this restaurant.',
      });
    }

    const existing = await prisma.orders.findFirst({
      where: { manual_dispatch_key: body.idempotency_key },
    });
    if (existing) {
      const rate =
        Number(await getBusinessSetting('manual_dispatch_commission')) || 10;
      return res.status(200).json({
        status: true,
        msg: 'Driver requested successfully',
        data: dispatchSummary(existing, rate),
      });
    }

    const customer = await walkInCustomer(restaurantIdNum);
    const taxPct = body.tax ?? 10;
    const itemPrice = body.order_amount;
    const deliveryFee = body.delivery_fee;
    const taxAmount = Math.round(itemPrice * (taxPct / 100) * 100) / 100;
    const orderTotal = Math.round((itemPrice + deliveryFee + taxAmount) * 100) / 100;
    const prepaid = body.payment_method === 'prepaid';

    const maxRow = await prisma.orders.aggregate({ _max: { id: true } });
    const nextId = BigInt(Math.max(100000, Number(maxRow._max?.id ?? 0) + 1));

    const now = new Date();
    const zoneId = restaurant.zone_id != null ? Number(restaurant.zone_id) : null;

    const order = await prisma.orders.create({
      data: {
        id: nextId,
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
        order_note: 'Manual dispatch - phone order',
        checked: false,
        created_at: now,
        updated_at: now,
      },
    });

    try {
      await sendOrderNotification(order);
      await notifyManualDispatchDriverPool(order);
      await emitManualDispatchOrderRequest(order);
    } catch (notifyErr) {
      console.error('[dispatch] notification failed', notifyErr);
    }

    const rate = Number(await getBusinessSetting('manual_dispatch_commission')) || 10;
    return res.status(200).json({
      status: true,
      msg: 'Driver requested successfully',
      data: dispatchSummary(order, rate),
    });
  } catch (error: unknown) {
    console.error('[dispatch] request-driver failed', error);
    return res.status(403).json({
      status: false,
      msg: 'Could not create the dispatch order.',
    });
  }
};
