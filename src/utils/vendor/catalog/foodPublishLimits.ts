import prisma from '../../../config/database';

export type FoodPublishQuota = {
  /** null = unlimited live menu items */
  max_live: number | null;
  published_live: number;
  remaining: number | null;
};

/** Live (non-draft) menu slots for subscription restaurants; drafts do not count. */
export async function getFoodPublishQuota(restaurantId: number): Promise<FoodPublishQuota> {
  const publishedLive = await prisma.food.count({
    where: { restaurant_id: restaurantId, is_draft: 0 },
  });

  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(restaurantId) },
    select: { restaurant_model: true },
  });

  if (!restaurant || restaurant.restaurant_model !== 'subscription') {
    return { max_live: null, published_live: publishedLive, remaining: null };
  }

  const sub = await prisma.restaurant_subscriptions.findFirst({
    where: { restaurant_id: restaurantId, status: true },
    orderBy: { id: 'desc' },
  });

  if (!sub) {
    return { max_live: null, published_live: publishedLive, remaining: null };
  }

  const raw = String(sub.max_product ?? '').trim().toLowerCase();
  if (!raw || raw === 'unlimited') {
    return { max_live: null, published_live: publishedLive, remaining: null };
  }

  const maxLive = parseInt(raw, 10);
  if (!Number.isFinite(maxLive) || maxLive <= 0) {
    return { max_live: null, published_live: publishedLive, remaining: null };
  }

  return {
    max_live: maxLive,
    published_live: publishedLive,
    remaining: Math.max(0, maxLive - publishedLive),
  };
}
