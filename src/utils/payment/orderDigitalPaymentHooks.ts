import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { sendNewOrderNotification } from '../notifications/sendNewOrderNotification';
import type { PaymentRequestRow } from './paymentRequestRepository';

const STORED_PAYMENT_METHOD = 'hypay';

async function updateUnpaidOrderPayment(orderId: bigint, paymentMethod: string) {
  const data: { payment_status: string; updated_at: Date; payment_method?: string } = {
    payment_status: 'paid',
    updated_at: new Date(),
  };
  if (paymentMethod !== 'partial_payment') {
    data.payment_method = paymentMethod;
  }
  await prisma.order_payments.updateMany({
    where: {
      order_id: new Prisma.Decimal(orderId.toString()),
      payment_status: 'unpaid',
    },
    data,
  });
}

/** PHP `order_place($data)` after successful digital payment. */
export async function runOrderPlacePaymentHook(payment: PaymentRequestRow): Promise<void> {
  if (payment.attribute !== 'order' || !payment.attribute_id) return;

  const orderId = BigInt(payment.attribute_id);
  const order = await prisma.orders.findUnique({ where: { id: orderId } });
  if (!order) return;

  const payMethod = payment.payment_method ?? STORED_PAYMENT_METHOD;

  await prisma.orders.update({
    where: { id: orderId },
    data: {
      order_status: 'confirmed',
      payment_status: 'paid',
      payment_method: order.payment_method === 'partial_payment' ? order.payment_method : payMethod,
      confirmed: new Date(),
      checked: false,
      updated_at: new Date(),
    },
  });

  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(Number(order.restaurant_id)) },
    select: { id: true, restaurant_model: true, vendor_id: true },
  });

  if (restaurant?.restaurant_model === 'subscription') {
    const sub = await prisma.restaurant_subscriptions.findFirst({
      where: { restaurant_id: new Prisma.Decimal(restaurant.id.toString()) },
      select: { id: true, max_order: true },
    });
    if (sub && sub.max_order !== 'unlimited') {
      const max = Number(sub.max_order);
      if (Number.isFinite(max) && max > 0) {
        await prisma.restaurant_subscriptions.update({
          where: { id: sub.id },
          data: { max_order: String(max - 1), updated_at: new Date() },
        });
      }
    }
  }

  await updateUnpaidOrderPayment(orderId, payMethod);

  if (restaurant?.vendor_id) {
    void sendNewOrderNotification(
      {
        order_id: orderId.toString(),
        restaurant_id: Number(order.restaurant_id),
        vendor_id: Number(restaurant.vendor_id),
        order_type: order.order_type ?? 'delivery',
        payment_method: payMethod,
        order_amount: Number(order.order_amount) || 0,
      },
      // Vendor `new_order` already went out when the customer placed the order.
      { skipVendorSocket: true }
    )
  }
}

/** PHP `order_failed($data)`. */
export async function runOrderFailedPaymentHook(payment: PaymentRequestRow): Promise<void> {
  if (payment.attribute !== 'order' || !payment.attribute_id) return;

  const orderId = BigInt(payment.attribute_id);
  const order = await prisma.orders.findUnique({ where: { id: orderId } });
  if (!order || order.payment_status === 'paid') return;

  const payMethod = payment.payment_method ?? STORED_PAYMENT_METHOD;

  await prisma.orders.update({
    where: { id: orderId },
    data: {
      order_status: 'failed',
      payment_method: order.payment_method === 'partial_payment' ? order.payment_method : payMethod,
      failed: new Date(),
      updated_at: new Date(),
    },
  });
}

export async function dispatchPaymentHook(
  hookName: string | null | undefined,
  payment: PaymentRequestRow
): Promise<void> {
  if (!hookName) return;
  if (hookName === 'order_place') {
    await runOrderPlacePaymentHook(payment);
    return;
  }
  if (hookName === 'order_failed') {
    await runOrderFailedPaymentHook(payment);
  }
}
