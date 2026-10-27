import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { sendNewOrderNotification } from '../notifications/sendNewOrderNotification';
import { findPaymentRequestById, type PaymentRequestRow } from './paymentRequestRepository';
import type { PlaceOrderInput } from '../../schemas/consumer/Order';

const AMOUNT_TOLERANCE = 0.02;
const STORED_PAYMENT_METHOD = 'hypay';

export function parsePaymentAdditionalData(
  payment: PaymentRequestRow
): Record<string, unknown> {
  if (!payment.additional_data) return {};
  try {
    const parsed = JSON.parse(payment.additional_data) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** Checkout body saved at generate-payment-link (payment-first flow). */
export function getStoredCheckoutPayload(payment: PaymentRequestRow): PlaceOrderInput | null {
  const extra = parsePaymentAdditionalData(payment);
  const raw = extra.checkout_payload;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as PlaceOrderInput;
}

export class CheckoutPaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckoutPaymentError';
  }
}

export async function assertPaidCheckoutPayment(params: {
  paymentRequestId: string;
  userId: number;
  orderAmount: number;
}) {
  const payment = await findPaymentRequestById(params.paymentRequestId.trim());
  if (!payment) {
    throw new CheckoutPaymentError('Payment not found');
  }
  if (!payment.is_paid) {
    throw new CheckoutPaymentError('Payment not completed');
  }
  if (payment.attribute !== 'order_checkout') {
    throw new CheckoutPaymentError('Payment already used or invalid for checkout');
  }
  if (payment.payer_id !== String(params.userId)) {
    throw new CheckoutPaymentError('Payment does not belong to this user');
  }
  if (Math.abs(payment.payment_amount - params.orderAmount) > AMOUNT_TOLERANCE) {
    throw new CheckoutPaymentError('Order total does not match paid amount');
  }
  return payment;
}

/** Latest paid checkout not yet linked to an order (payment-first flow). */
export async function findPaidUnusedCheckoutPayment(userId: number): Promise<{
  id: string;
  payment_amount: number;
} | null> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<Array<{ id: string; payment_amount: unknown }>>`
    SELECT id, payment_amount
    FROM payment_requests
    WHERE payer_id = ${String(userId)}
      AND is_paid = true
      AND attribute = 'order_checkout'
      AND updated_at >= ${since}
    ORDER BY updated_at DESC
    LIMIT 1
  `;
  if (!rows.length) return null;
  return {
    id: String(rows[0].id),
    payment_amount: Number(rows[0].payment_amount) || 0,
  };
}

export async function attachCheckoutPaymentToOrder(
  paymentRequestId: string,
  orderId: bigint
): Promise<void> {
  const now = new Date();
  await prisma.$executeRaw`
    UPDATE payment_requests
    SET attribute = 'order',
        attribute_id = ${orderId.toString()},
        updated_at = ${now}
    WHERE id = ${paymentRequestId}
      AND attribute = 'order_checkout'
  `;
}

async function updateUnpaidOrderPayment(orderId: bigint, paymentMethod: string) {
  await prisma.order_payments.updateMany({
    where: {
      order_id: new Prisma.Decimal(orderId.toString()),
      payment_status: 'unpaid',
    },
    data: {
      payment_status: 'paid',
      payment_method: paymentMethod,
      updated_at: new Date(),
    },
  });
}

/**
 * Recovery when HyperPay succeeded but place order ran without payment_request_id.
 */
export async function attachPaidCheckoutToExistingOrder(params: {
  userId: number;
  orderId: bigint;
  paymentRequestId: string;
}): Promise<void> {
  const order = await prisma.orders.findFirst({
    where: {
      id: params.orderId,
      user_id: params.userId,
      is_guest: false,
    },
  });
  if (!order) {
    throw new CheckoutPaymentError('Order not found');
  }
  if (order.payment_status === 'paid') {
    throw new CheckoutPaymentError('Order is already paid');
  }
  if (order.order_status === 'canceled' || order.order_status === 'failed') {
    throw new CheckoutPaymentError('Order cannot be paid');
  }

  const payment = await assertPaidCheckoutPayment({
    paymentRequestId: params.paymentRequestId,
    userId: params.userId,
    orderAmount: Number(order.order_amount) || 0,
  });

  const payMethod = payment.payment_method ?? STORED_PAYMENT_METHOD;

  await prisma.orders.update({
    where: { id: params.orderId },
    data: {
      payment_status: 'paid',
      payment_method:
        order.payment_method === 'partial_payment' ? order.payment_method : payMethod,
      checked: false,
      updated_at: new Date(),
    },
  });

  await attachCheckoutPaymentToOrder(params.paymentRequestId, params.orderId);
  await updateUnpaidOrderPayment(params.orderId, payMethod);

  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(Number(order.restaurant_id)) },
    select: { vendor_id: true },
  });
  if (restaurant?.vendor_id) {
    void sendNewOrderNotification(
      {
        order_id: params.orderId.toString(),
        restaurant_id: Number(order.restaurant_id),
        vendor_id: Number(restaurant.vendor_id),
        order_type: order.order_type ?? 'delivery',
        payment_method: payMethod,
        order_amount: Number(order.order_amount) || 0,
      },
      { skipVendorSocket: false }
    );
  }
}
