import { food, reviews } from '@prisma/client';
import prisma from '../../config/database';
import { publicFoodMediaUrl, publicMediaUrl } from '../mediaStorage';
import { notPosWhere } from '../vendor/order/query';

type RatingHistogram = Record<'1' | '2' | '3' | '4' | '5', number>;

function emptyHistogram(): RatingHistogram {
  return { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
}

function parseHistogram(raw: string | null | undefined): RatingHistogram {
  if (!raw?.trim()) return emptyHistogram();
  try {
    const parsed = JSON.parse(raw) as Record<string, number>;
    return {
      '1': Number(parsed['1'] ?? parsed[1] ?? 0),
      '2': Number(parsed['2'] ?? parsed[2] ?? 0),
      '3': Number(parsed['3'] ?? parsed[3] ?? 0),
      '4': Number(parsed['4'] ?? parsed[4] ?? 0),
      '5': Number(parsed['5'] ?? parsed[5] ?? 0),
    };
  } catch {
    return emptyHistogram();
  }
}

/** PHP ProductLogic::update_rating */
export function updateProductRatingHistogram(
  ratingsJson: string | null | undefined,
  productRating: number
): string {
  const histogram = parseHistogram(ratingsJson);
  const key = String(Math.min(5, Math.max(1, Math.round(productRating)))) as keyof RatingHistogram;
  histogram[key] = (histogram[key] ?? 0) + 1;
  return JSON.stringify(histogram);
}

/** PHP ProductLogic::get_avg_rating */
export function averageFromHistogram(histogram: RatingHistogram): number {
  const sum =
    histogram['1'] +
    histogram['2'] * 2 +
    histogram['3'] * 3 +
    histogram['4'] * 4 +
    histogram['5'] * 5;
  const count =
    histogram['1'] + histogram['2'] + histogram['3'] + histogram['4'] + histogram['5'];
  if (!count) return 0;
  return Math.round((sum / count) * 100) / 100;
}

/** PHP RestaurantLogic::update_restaurant_rating — stored as [5★ … 1★] counts */
export function updateRestaurantRatingHistogram(
  ratingsJson: string | null | undefined,
  productRating: number
): string {
  const star = Math.min(5, Math.max(1, Math.round(productRating)));
  const arr = [0, 0, 0, 0, 0];
  if (ratingsJson?.trim()) {
    try {
      const parsed = JSON.parse(ratingsJson);
      if (Array.isArray(parsed)) {
        for (let i = 0; i < 5; i++) arr[i] = Number(parsed[i] ?? 0);
      }
    } catch {
      /* keep zeros */
    }
  }
  const idx = 5 - star;
  arr[idx] = (arr[idx] ?? 0) + 1;
  return JSON.stringify(arr);
}

type FoodDetailsSnapshot = Record<string, unknown>;

/** Pending-review rows: expose `food_details.image` as a public CDN URL (prefer live `food.image`). */
export function enrichFoodDetailsForReview(
  raw: string | null | undefined,
  liveFoodImage: string | null | undefined
): FoodDetailsSnapshot | null {
  if (!raw?.trim()) return null;
  let parsed: FoodDetailsSnapshot;
  try {
    parsed = JSON.parse(raw) as FoodDetailsSnapshot;
    if (!parsed || typeof parsed !== 'object') return null;
  } catch {
    return null;
  }
  const snapshotImage =
    typeof parsed.image === 'string' && parsed.image.trim() ? parsed.image : null;
  const stored = liveFoodImage?.trim() || snapshotImage;
  const full = stored ? publicFoodMediaUrl(stored) : null;
  if (full) {
    parsed.image = full;
    parsed.image_full_url = full;
  }
  return parsed;
}

export function parseReviewAttachments(raw: string | null | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => publicMediaUrl(String(p)) ?? String(p));
  } catch {
    return [];
  }
}

export async function formatReviewRow(review: reviews & { customer?: { f_name: string | null; l_name: string | null; image: string | null } | null }) {
  let foodName: string | null = null;
  if (review.food_id) {
    const f = await prisma.food.findUnique({
      where: { id: BigInt(Number(review.food_id)) },
      select: { name: true },
    });
    foodName = f?.name ?? null;
  }

  return {
    id: Number(review.id),
    food_id: Number(review.food_id),
    user_id: Number(review.user_id),
    comment: review.comment,
    attachment: parseReviewAttachments(review.attachment),
    rating: Number(review.rating),
    order_id: review.order_id != null ? Number(review.order_id) : null,
    item_campaign_id:
      review.item_campaign_id != null ? Number(review.item_campaign_id) : null,
    status: review.status,
    restaurant_id: review.restaurant_id != null ? Number(review.restaurant_id) : null,
    reply: review.reply,
    created_at: review.created_at,
    updated_at: review.updated_at,
    food_name: foodName,
    customer: review.customer
      ? {
          f_name: review.customer.f_name,
          l_name: review.customer.l_name,
          image: publicMediaUrl(review.customer.image) ?? review.customer.image,
        }
      : null,
  };
}

export async function applyReviewToFoodAndRestaurant(foodRow: food, rating: number) {
  const newRatingJson = updateProductRatingHistogram(foodRow.rating, rating);
  const histogram = parseHistogram(newRatingJson);
  const avg = averageFromHistogram(histogram);

  await prisma.food.update({
    where: { id: foodRow.id },
    data: {
      rating: newRatingJson,
      avg_rating: avg,
      rating_count: { increment: 1 },
      updated_at: new Date(),
    },
  });

  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(Number(foodRow.restaurant_id)) },
    select: { id: true, rating: true },
  });
  if (restaurant) {
    await prisma.restaurants.update({
      where: { id: restaurant.id },
      data: {
        rating: updateRestaurantRatingHistogram(restaurant.rating, rating),
        updated_at: new Date(),
      },
    });
  }
}

export function overallRatingFromReviews(reviewRows: { rating: bigint | number }[]): number {
  if (!reviewRows.length) return 0;
  const sum = reviewRows.reduce((acc, r) => acc + Number(r.rating), 0);
  return Math.round((sum / reviewRows.length) * 100) / 100;
}

/** Restaurant `rating` column — JSON array [5★ … 1★] counts (legacy PHP). */
export function restaurantAvgFromStoredRating(raw: string | null | undefined): {
  avg_rating: number;
  rating_count: number;
} {
  if (!raw?.trim()) return { avg_rating: 0, rating_count: 0 };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { avg_rating: 0, rating_count: 0 };
    let sum = 0;
    let count = 0;
    for (let i = 0; i < 5; i++) {
      const c = Number(parsed[i] ?? 0);
      const star = 5 - i;
      sum += c * star;
      count += c;
    }
    return {
      avg_rating: count ? Math.round((sum / count) * 100) / 100 : 0,
      rating_count: count,
    };
  } catch {
    return { avg_rating: 0, rating_count: 0 };
  }
}

export async function aggregateRestaurantReviewStats(restaurantId: number): Promise<{
  avg_rating: number;
  rating_count: number;
}> {
  const agg = await prisma.reviews.aggregate({
    where: { restaurant_id: restaurantId, status: true },
    _avg: { rating: true },
    _count: { id: true },
  });
  const count = agg._count.id;
  if (!count) {
    return { avg_rating: 0, rating_count: 0 };
  }
  return {
    avg_rating: Math.round(Number(agg._avg.rating ?? 0) * 100) / 100,
    rating_count: count,
  };
}

export async function findPendingReviewOrderForRestaurant(
  userId: number,
  restaurantId: number
): Promise<number | null> {
  const orders = await prisma.orders.findMany({
    where: {
      user_id: userId,
      is_guest: false,
      restaurant_id: restaurantId,
      order_status: 'delivered',
      ...notPosWhere,
    },
    orderBy: { id: 'desc' },
    select: { id: true },
    take: 15,
  });

  for (const order of orders) {
    const pending = await loadPendingOrderReviews(Number(order.id), userId);
    if (pending?.details?.length) {
      return Number(order.id);
    }
  }
  return null;
}

export async function loadRestaurantReviews(
  restaurantId: number,
  search?: string
): Promise<{
  avg_rating: number;
  rating_count: number;
  reviews: Record<string, unknown>[];
} | null> {
  const restaurant = await prisma.restaurants.findFirst({
    where: { id: BigInt(restaurantId), status: true },
    select: { id: true },
  });
  if (!restaurant) {
    return null;
  }

  const reviewWhere: {
    restaurant_id: number;
    status: boolean;
    OR?: Array<{ comment?: { contains: string; mode: 'insensitive' } }>;
  } = {
    restaurant_id: restaurantId,
    status: true,
  };
  const q = search?.trim();
  if (q) {
    reviewWhere.OR = [{ comment: { contains: q, mode: 'insensitive' } }];
  }

  const reviewRows = await prisma.reviews.findMany({
    where: reviewWhere,
    orderBy: { id: 'desc' },
  });

  const foodIds = [...new Set(reviewRows.map((r) => Number(r.food_id)).filter((id) => id > 0))];
  const userIds = [...new Set(reviewRows.map((r) => Number(r.user_id)))];

  const [foods, users] = await Promise.all([
    foodIds.length
      ? prisma.food.findMany({
          where: { id: { in: foodIds.map((id) => BigInt(id)) } },
          select: { id: true, name: true, image: true },
        })
      : Promise.resolve([]),
    userIds.length
      ? prisma.users.findMany({
          where: { id: { in: userIds.map((id) => BigInt(id)) } },
          select: { id: true, f_name: true, l_name: true, image: true },
        })
      : Promise.resolve([]),
  ]);

  const foodById = new Map(foods.map((f) => [Number(f.id), f]));
  const userById = new Map(users.map((u) => [Number(u.id), u]));

  const stats = await aggregateRestaurantReviewStats(restaurantId);

  const reviews = reviewRows.map((review) => {
    const foodRow = foodById.get(Number(review.food_id));
    const customer = userById.get(Number(review.user_id));
    const customerName = [customer?.f_name, customer?.l_name].filter(Boolean).join(' ') || null;
    const foodImage = foodRow?.image ?? null;

    return {
      id: Number(review.id),
      food_id: Number(review.food_id),
      user_id: Number(review.user_id),
      comment: review.comment,
      attachment: parseReviewAttachments(review.attachment),
      rating: Number(review.rating),
      order_id: review.order_id != null ? Number(review.order_id) : null,
      item_campaign_id:
        review.item_campaign_id != null ? Number(review.item_campaign_id) : null,
      status: review.status,
      restaurant_id: review.restaurant_id != null ? Number(review.restaurant_id) : null,
      reply: review.reply,
      created_at: review.created_at,
      updated_at: review.updated_at,
      food_name: foodRow?.name ?? null,
      food_image: foodImage,
      food_image_full_url: foodImage ? publicFoodMediaUrl(foodImage) : null,
      customer_name: customerName,
      customer: customer
        ? {
            f_name: customer.f_name,
            l_name: customer.l_name,
            image: publicMediaUrl(customer.image) ?? customer.image,
          }
        : null,
    };
  });

  return {
    avg_rating: stats.avg_rating,
    rating_count: stats.rating_count,
    reviews,
  };
}

export async function loadFoodReviews(foodId: number) {
  const food = await prisma.food.findUnique({
    where: { id: BigInt(foodId) },
    select: { avg_rating: true, rating_count: true },
  });
  if (!food) {
    return null;
  }

  const reviewRows = await prisma.reviews.findMany({
    where: { food_id: foodId, status: true },
    orderBy: { id: 'desc' },
  });

  const userIds = [...new Set(reviewRows.map((r) => Number(r.user_id)))];
  const users =
    userIds.length > 0
      ? await prisma.users.findMany({
          where: { id: { in: userIds.map((id) => BigInt(id)) } },
          select: { id: true, f_name: true, l_name: true, image: true },
        })
      : [];
  const userById = new Map(users.map((u) => [Number(u.id), u]));

  const reviews = await Promise.all(
    reviewRows.map((r) =>
      formatReviewRow({
        ...r,
        customer: userById.get(Number(r.user_id)) ?? null,
      } as reviews & {
        customer?: { f_name: string | null; l_name: string | null; image: string | null } | null;
      })
    )
  );

  return {
    avg_rating: Number(food.avg_rating) || 0,
    rating_count: Number(food.rating_count) || 0,
    reviews,
  };
}

export async function loadPendingOrderReviews(orderId: number, userId: number) {
  const order = await prisma.orders.findFirst({
    where: { id: BigInt(orderId), user_id: userId },
    select: { id: true },
  });
  if (!order) {
    return null;
  }

  const orderDetails = await prisma.order_details.findMany({
    where: { order_id: orderId },
    select: {
      id: true,
      food_id: true,
      item_campaign_id: true,
      food_details: true,
      quantity: true,
      price: true,
    },
  });

  const foodIds = orderDetails.map((d) => Number(d.food_id)).filter((id) => id > 0);
  const foods =
    foodIds.length > 0
      ? await prisma.food.findMany({
          where: { id: { in: [...new Set(foodIds)].map((id) => BigInt(id)) } },
          select: { id: true, image: true },
        })
      : [];
  const foodImageById = new Map(foods.map((f) => [Number(f.id), f.image]));

  const itemIds = orderDetails
    .map((d) => (d.item_campaign_id != null ? Number(d.item_campaign_id) : 0))
    .filter((id) => id > 0);

  const reviewWhere: { order_id: number; OR?: Array<Record<string, unknown>> } = {
    order_id: orderId,
  };
  const orClauses: Array<Record<string, unknown>> = [];
  if (foodIds.length) orClauses.push({ food_id: { in: foodIds } });
  if (itemIds.length) orClauses.push({ item_campaign_id: { in: itemIds } });
  if (orClauses.length) reviewWhere.OR = orClauses;

  const existing = await prisma.reviews.findMany({
    where: reviewWhere as any,
    select: { food_id: true, item_campaign_id: true },
  });

  const reviewedFoodIds = new Set(existing.map((r) => Number(r.food_id)));
  const reviewedItemIds = new Set(
    existing.map((r) => (r.item_campaign_id != null ? Number(r.item_campaign_id) : 0))
  );

  const details = orderDetails
    .filter((detail) => {
      const fid = Number(detail.food_id);
      const iid = detail.item_campaign_id != null ? Number(detail.item_campaign_id) : 0;
      return (fid > 0 && !reviewedFoodIds.has(fid)) || (iid > 0 && !reviewedItemIds.has(iid));
    })
    .map((detail) => ({
      id: Number(detail.id),
      food_id: detail.food_id != null ? Number(detail.food_id) : null,
      order_id: orderId,
      item_campaign_id:
        detail.item_campaign_id != null ? Number(detail.item_campaign_id) : null,
      quantity: Number(detail.quantity),
      price: Number(detail.price),
      food_details: enrichFoodDetailsForReview(
        detail.food_details,
        detail.food_id != null
          ? foodImageById.get(Number(detail.food_id)) ?? null
          : null
      ),
    }));

  return { details };
}
