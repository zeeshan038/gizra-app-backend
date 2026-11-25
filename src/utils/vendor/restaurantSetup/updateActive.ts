import prisma from '../../../config/database';
import { emitRestaurantActiveAvailabilityChanged } from './temporaryPause';

export async function setRestaurantActive(restaurantId: bigint, closed: boolean) {
  const active = !closed;
  await prisma.restaurants.update({
    where: { id: restaurantId },
    data: { active, updated_at: new Date() },
  });
  void emitRestaurantActiveAvailabilityChanged(restaurantId);
  return {
    active,
    msg: active ? 'Restaurant opened' : 'Restaurant temporarily closed',
  };
}
