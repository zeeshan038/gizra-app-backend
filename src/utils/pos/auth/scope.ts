import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { PosApiKeyRecord, restaurantIdFromKey } from './token';

export function assertPosOwnsRestaurant(key: PosApiKeyRecord, restaurantId: number | bigint | string): boolean {
  return restaurantIdFromKey(key) === Number(restaurantId);
}

export async function loadOrderForPosKey(
  key: PosApiKeyRecord,
  orderId: bigint | number | string
) {
  const restaurantId = restaurantIdFromKey(key);
  return prisma.orders.findFirst({
    where: {
      id: BigInt(orderId),
      restaurant_id: new Prisma.Decimal(restaurantId),
    },
  });
}
