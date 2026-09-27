import prisma from '../../../config/database';

export async function setRestaurantActive(restaurantId: bigint, closed: boolean) {
  const active = !closed;
  await prisma.restaurants.update({
    where: { id: restaurantId },
    data: { active, updated_at: new Date() },
  });
  return {
    active,
    msg: active ? 'Restaurant opened' : 'Restaurant temporarily closed',
  };
}
