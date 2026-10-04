import { orders } from '@prisma/client';
import { sendOrderNotification } from './sendOrderNotification';

/** @deprecated Use sendOrderNotification — kept for call sites. */
export async function notifyDeliveryMenForOrder(order: orders): Promise<void> {
  await sendOrderNotification(order);
}
