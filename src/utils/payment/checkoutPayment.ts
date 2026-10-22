import prisma from '../../config/database';
import { findPaymentRequestById } from './paymentRequestRepository';

const AMOUNT_TOLERANCE = 0.02;

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
