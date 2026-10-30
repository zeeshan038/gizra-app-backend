import prisma from '../../../config/database';
import { getBusinessSettingFlag } from '../../consumer/businessSettings';


export async function getAdminNewOrderAlert() {
  const enabled = await getBusinessSettingFlag('admin_order_notification');
  if (!enabled) {
    return { enabled: false, new_order: 0, play_sound: false };
  }

  const where = {
    checked: false,
    OR: [
      { payment_method: { not: 'digital_payment' } },
      { order_status: { not: 'pending' } },
    ],
  };

  const [new_order, latestOrder] = await Promise.all([
    prisma.orders.count({ where }),
    prisma.orders.findFirst({
      where,
      orderBy: { id: 'desc' },
      select: { id: true },
    }),
  ]);

  return {
    enabled: true,
    new_order,
    latest_order_id: latestOrder ? Number(latestOrder.id) : null,
    play_sound: new_order > 0,
    type: 'restaurant_order',
  };
}
