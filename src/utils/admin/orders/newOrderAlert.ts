import prisma from '../../../config/database';
import { getBusinessSettingFlag } from '../../consumer/businessSettings';

/** PHP Admin\\SystemController::restaurant_data — unchecked orders eligible for admin alert. */
export async function getAdminNewOrderAlert() {
  const enabled = await getBusinessSettingFlag('admin_order_notification');
  if (!enabled) {
    return { enabled: false, new_order: 0, play_sound: false };
  }

  const new_order = await prisma.orders.count({
    where: {
      checked: false,
      OR: [
        { payment_method: { not: 'digital_payment' } },
        { order_status: { not: 'pending' } },
      ],
    },
  });

  return {
    enabled: true,
    new_order,
    play_sound: new_order > 0,
    type: 'restaurant_order',
  };
}
