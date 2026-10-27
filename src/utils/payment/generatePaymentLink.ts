import prisma from '../../config/database';
import { getBusinessSetting } from '../consumer/businessSettings';
import { createPaymentRequest } from './paymentRequestRepository';
import { getPaymentPublicBaseUrl } from './hyperPayConfig';

const GATEWAY_ROUTE: Record<string, string> = {
  hyper_pay: '/payment/hyperpay/pay',
};

export async function generateOrderPaymentLink(params: {
  userId: number;
  orderId: number;
  paymentMethod: string;
  callback: string;
  paymentPlatform: 'app' | 'web';
  payer: { name: string; email: string; phone: string };
}) {
  const route = GATEWAY_ROUTE[params.paymentMethod];
  if (!route) {
    throw new Error(`Payment method ${params.paymentMethod} is not supported`);
  }

  const order = await prisma.orders.findFirst({
    where: {
      id: BigInt(params.orderId),
      user_id: params.userId,
      payment_status: 'unpaid',
    },
    select: { id: true, order_amount: true, restaurant_id: true },
  });

  if (!order) {
    throw new Error('Order not found or already paid');
  }
  if (Number(order.order_amount) <= 0) {
    throw new Error('Payment amount can not be 0');
  }

  const [businessName, logoSetting] = await Promise.all([
    getBusinessSetting('business_name'),
    getBusinessSetting('logo'),
  ]);

  const currencyCode = (await getBusinessSetting('currency')) ?? 'ILS';

  const paymentId = await createPaymentRequest({
    payer_id: String(params.userId),
    receiver_id: String(order.restaurant_id),
    payment_amount: Number(order.order_amount),
    success_hook: 'order_place',
    failure_hook: 'order_failed',
    currency_code: currencyCode.toUpperCase(),
    payment_method: params.paymentMethod,
    additional_data: {
      business_name: businessName,
      business_logo: logoSetting,
    },
    payer_information: {
      name: params.payer.name,
      email: params.payer.email,
      phone: params.payer.phone,
    },
    receiver_information: { name: 'receiver_name', image: 'example.png' },
    external_redirect_link: params.callback,
    attribute: 'order',
    attribute_id: String(order.id),
    payment_platform: params.paymentPlatform,
  });

  const base = getPaymentPublicBaseUrl();
  const redirect_link = `${base}${route}?payment_id=${paymentId}`;
  return { redirect_link, payment_id: paymentId };
}

/** Payment-first checkout — HyperPay for cart totals before POST /consumer/order/place. */
export async function generateCheckoutPaymentLink(params: {
  userId: number;
  restaurantId: number;
  orderAmount: number;
  paymentMethod: string;
  callback: string;
  paymentPlatform: 'app' | 'web';
  payer: { name: string; email: string; phone: string };
  /** Saved on payment_requests.additional_data for POST /complete-checkout-payment. */
  checkoutPayload?: Record<string, unknown>;
}) {
  const route = GATEWAY_ROUTE[params.paymentMethod];
  if (!route) {
    throw new Error(`Payment method ${params.paymentMethod} is not supported`);
  }
  if (params.orderAmount <= 0) {
    throw new Error('Payment amount can not be 0');
  }

  const [businessName, logoSetting, currencyCode] = await Promise.all([
    getBusinessSetting('business_name'),
    getBusinessSetting('logo'),
    getBusinessSetting('currency'),
  ]);

  const paymentId = await createPaymentRequest({
    payer_id: String(params.userId),
    receiver_id: String(params.restaurantId),
    payment_amount: params.orderAmount,
    success_hook: 'order_place',
    failure_hook: 'order_failed',
    currency_code: (currencyCode ?? 'ILS').toUpperCase(),
    payment_method: params.paymentMethod,
    additional_data: {
      business_name: businessName,
      business_logo: logoSetting,
      checkout_flow: 'payment_first',
      ...(params.checkoutPayload ? { checkout_payload: params.checkoutPayload } : {}),
    },
    payer_information: {
      name: params.payer.name,
      email: params.payer.email,
      phone: params.payer.phone,
    },
    receiver_information: { name: 'receiver_name', image: 'example.png' },
    external_redirect_link: params.callback,
    attribute: 'order_checkout',
    payment_platform: params.paymentPlatform,
  });

  const base = getPaymentPublicBaseUrl();
  const redirect_link = `${base}${route}?payment_id=${paymentId}`;
  return { redirect_link, payment_id: paymentId };
}

/** PHP customer wallet add-fund — HyperPay checkout for a pending wallet_payments row. */
export async function generateWalletAddFundLink(params: {
  userId: number;
  amount: number;
  paymentMethod: string;
  callback: string;
  paymentPlatform: 'app' | 'web';
  payer: { name: string; email: string; phone: string };
}) {
  const route = GATEWAY_ROUTE[params.paymentMethod];
  if (!route) {
    throw new Error(`Payment method ${params.paymentMethod} is not supported`);
  }
  if (params.amount <= 0) {
    throw new Error('Payment amount can not be 0');
  }

  const now = new Date();
  const walletPayment = await prisma.wallet_payments.create({
    data: {
      user_id: params.userId,
      amount: params.amount,
      payment_status: 'pending',
      payment_method: params.paymentMethod,
      created_at: now,
      updated_at: now,
    },
  });

  const [businessName, logoSetting, currency] = await Promise.all([
    getBusinessSetting('business_name'),
    getBusinessSetting('logo'),
    getBusinessSetting('currency'),
  ]);

  const paymentId = await createPaymentRequest({
    payer_id: String(params.userId),
    receiver_id: '100',
    payment_amount: params.amount,
    success_hook: 'wallet_success',
    failure_hook: 'wallet_failed',
    currency_code: (currency ?? 'ILS').toUpperCase(),
    payment_method: params.paymentMethod,
    additional_data: {
      business_name: businessName,
      business_logo: logoSetting,
    },
    payer_information: {
      name: params.payer.name,
      email: params.payer.email,
      phone: params.payer.phone,
    },
    receiver_information: { name: 'receiver_name', image: 'example.png' },
    external_redirect_link: params.callback,
    attribute: 'wallet_payments',
    attribute_id: String(walletPayment.id),
    payment_platform: params.paymentPlatform,
  });

  const base = getPaymentPublicBaseUrl();
  const redirect_link = `${base}${route}?payment_id=${paymentId}`;
  return { redirect_link, payment_id: paymentId };
}
