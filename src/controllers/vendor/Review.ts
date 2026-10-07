import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { getVendorContext } from '../../utils/vendor/context';
import {
  vendorReviewListQuerySchema,
  vendorReviewReplySchema,
} from '../../schemas/vendor/reviews';
import { publicMediaUrl } from '../../utils/mediaStorage';

function formatReviewListItem(params: {
  review: {
    id: bigint;
    food_id: { toString(): string } | number | bigint;
    user_id: { toString(): string } | number | bigint;
    comment: string | null;
    rating: bigint;
    order_id: { toString(): string } | number | bigint | null;
    reply: string | null;
    created_at: Date | null;
  };
  food: { id: bigint; name: string | null; image: string | null } | null;
  user: { f_name: string | null; l_name: string | null; phone: string | null } | null;
  sl: number;
}) {
  const { review, food, user, sl } = params;
  const imageRaw = food?.image?.trim();
  const imagePath = imageRaw
    ? imageRaw.includes('/')
      ? imageRaw
      : `product/${imageRaw}`
    : null;

  return {
    sl,
    id: Number(review.id),
    food_id: Number(review.food_id),
    food_name: food?.name ?? '',
    food_image_url: imagePath ? publicMediaUrl(imagePath) : null,
    order_id: review.order_id != null ? Number(review.order_id) : null,
    reviewer_name: [user?.f_name, user?.l_name].filter(Boolean).join(' ') || 'Customer',
    reviewer_phone: user?.phone ?? '',
    review: review.comment ?? '',
    rating: Number(review.rating),
    reply: review.reply,
    date: review.created_at,
  };
}

/**
 * @Description Customer reviews for this restaurant (via food)
 * @Route GET /api/vendor/reviews
 * @Access Vendor
 */
export const listVendorReviews = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const validated = vendorReviewListQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const { search, limit, offset } = validated.value as {
    search?: string;
    limit: number;
    offset: number;
  };

  try {
    const restaurantFoods = await prisma.food.findMany({
      where: { restaurant_id: ctx.restaurantId },
      select: { id: true },
    });
    const foodIds = restaurantFoods.map((f) => Number(f.id));
    if (!foodIds.length) {
      return res.status(200).json({
        status: true,
        data: { total: 0, limit, offset, reviews: [] },
      });
    }

    let matchingFoodIds = foodIds;
    let matchingUserIds: number[] | null = null;

    if (search?.trim()) {
      const q = search.trim();
      const foodsByName = await prisma.food.findMany({
        where: {
          restaurant_id: ctx.restaurantId,
          name: { contains: q, mode: 'insensitive' },
        },
        select: { id: true },
      });
      matchingFoodIds = foodsByName.map((f) => Number(f.id));

      const usersByPhone = await prisma.users.findMany({
        where: { phone: { contains: q, mode: 'insensitive' } },
        select: { id: true },
        take: 200,
      });
      matchingUserIds = usersByPhone.map((u) => Number(u.id));
    }

    const where: Prisma.reviewsWhereInput = {
      food_id: { in: foodIds },
    };

    if (search?.trim()) {
      where.OR = [
        { food_id: { in: matchingFoodIds.length ? matchingFoodIds : [-1] } },
        ...(matchingUserIds?.length
          ? [{ user_id: { in: matchingUserIds } }]
          : []),
      ];
    }

    const [total, reviewRows] = await Promise.all([
      prisma.reviews.count({ where }),
      prisma.reviews.findMany({
        where,
        orderBy: { id: 'desc' },
        skip: offset,
        take: limit,
      }),
    ]);

    const reviewFoodIds = [...new Set(reviewRows.map((r) => Number(r.food_id)))];
    const reviewUserIds = [...new Set(reviewRows.map((r) => Number(r.user_id)))];

    const [foods, users] = await Promise.all([
      prisma.food.findMany({
        where: { id: { in: reviewFoodIds.map((id) => BigInt(id)) } },
        select: { id: true, name: true, image: true },
      }),
      prisma.users.findMany({
        where: { id: { in: reviewUserIds.map((id) => BigInt(id)) } },
        select: { id: true, f_name: true, l_name: true, phone: true },
      }),
    ]);

    const foodById = new Map(foods.map((f) => [Number(f.id), f]));
    const userById = new Map(users.map((u) => [Number(u.id), u]));

    const reviews = reviewRows.map((review, index) =>
      formatReviewListItem({
        review,
        food: foodById.get(Number(review.food_id)) ?? null,
        user: userById.get(Number(review.user_id)) ?? null,
        sl: offset + index + 1,
      })
    );

    return res.status(200).json({
      status: true,
      data: { total, limit, offset, reviews },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Reply to a customer review
 * @Route PUT /api/vendor/reviews/:id/reply
 * @Access Vendor
 */
export const replyToVendorReview = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const id = Number(req.params.id);
  const validated = vendorReviewReplySchema.validate(req.body, { stripUnknown: true });
  if (validated.error || !Number.isFinite(id)) {
    return res.status(400).json({
      status: false,
      msg: validated.error?.details.map((d) => d.message).join(', ') ?? 'Invalid request',
    });
  }

  try {
    const review = await prisma.reviews.findUnique({ where: { id: BigInt(id) } });
    if (!review) {
      return res.status(404).json({ status: false, msg: 'Review not found' });
    }

    const food = await prisma.food.findFirst({
      where: { id: BigInt(Number(review.food_id)), restaurant_id: ctx.restaurantId },
      select: { id: true },
    });
    if (!food) {
      return res.status(403).json({ status: false, msg: 'Review not found for your restaurant' });
    }

    const updated = await prisma.reviews.update({
      where: { id: BigInt(id) },
      data: {
        reply: validated.value.reply,
        restaurant_id: ctx.restaurantId,
        updated_at: new Date(),
      },
    });

    return res.status(200).json({
      status: true,
      msg: 'Review reply updated',
      data: { id: Number(updated.id), reply: updated.reply },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};
