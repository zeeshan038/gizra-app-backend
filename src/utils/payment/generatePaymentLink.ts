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
