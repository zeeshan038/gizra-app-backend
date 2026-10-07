import { Request, Response } from 'express';
import prisma from '../../config/database';
import {
  consumerReviewsQuerySchema,
  submitDeliveryManReviewSchema,
  submitFoodReviewSchema,
} from '../../schemas/consumer/Review';
import { sendApiError, joiFirstMessage, errorMessageFromUnknown } from '../../utils/apiErrorResponse';
import {
  applyReviewToFoodAndRestaurant,
  loadFoodReviews,
  loadPendingOrderReviews,
} from '../../utils/consumer/reviewHelpers';
import { loadDeliveryManReviews, submitDeliveryManReview } from '../../utils/consumer/dmReviewHelpers';

/**
 * @Description Consumer reviews — GET with exactly one query: food_id (public ratings list), delivery_man_id (public driver ratings), or order_id (auth: pending food items to rate). See Swagger tag Consumer Reviews.
 * @Route GET /api/consumer/reviews
 * @Access Public for food_id and delivery_man_id; registered consumer for order_id
 */
export const getConsumerReviews = async (req: Request, res: Response): Promise<any> => {
  const validated = consumerReviewsQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }

  const { food_id: foodId, order_id: orderId, delivery_man_id: deliveryManId } =
    validated.value as {
      food_id?: number;
      order_id?: number;
      delivery_man_id?: number;
    };

  try {
    if (foodId != null) {
      const payload = await loadFoodReviews(foodId);
      if (!payload) {
        return sendApiError(res, 404, 'Food not found');
      }
      return res.status(200).json(payload);
    }

    if (deliveryManId != null) {
      const payload = await loadDeliveryManReviews(deliveryManId);
      if (!payload) {
        return sendApiError(res, 404, 'Delivery man not found');
      }
      return res.status(200).json(payload);
    }

    if (!req.user?.id || req.user.isGuest) {
      return sendApiError(res, 401, 'Login required to review an order');
    }

    const payload = await loadPendingOrderReviews(orderId!, Number(req.user.id));
    if (!payload) {
      return sendApiError(res, 404, 'Order not found');
    }
    return res.status(200).json(payload);
  } catch (e: unknown) {
    return sendApiError(res, 403, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Submit food review (body with food_id) OR driver review (body with delivery_man_id) — separate optional POSTs; see Swagger Consumer Reviews.
 * @Route POST /api/consumer/reviews
 * @Access Consumer (JWT)
 */
export const submitConsumerReview = async (req: Request, res: Response): Promise<any> => {
  if (!req.user?.id || req.user.isGuest) {
    return sendApiError(res, 401, 'Login required to submit a review');
  }
  const userId = Number(req.user.id);

  if (req.body?.delivery_man_id != null) {
    const validated = submitDeliveryManReviewSchema.validate(req.body, { stripUnknown: true });
    if (validated.error) {
      return sendApiError(res, 403, joiFirstMessage(validated.error));
    }
    const body = validated.value;
    try {
      const result = await submitDeliveryManReview({
        userId,
        delivery_man_id: body.delivery_man_id,
        order_id: body.order_id,
        comment: body.comment,
        rating: body.rating,
        attachment: body.attachment,
      });
      if (!result.ok) {
        return sendApiError(res, result.httpStatus, result.message);
      }
      return res.status(200).json({ status: true, msg: 'Review submitted successfully' });
    } catch (e: unknown) {
      return sendApiError(res, 403, errorMessageFromUnknown(e));
    }
  }

  const validated = submitFoodReviewSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }

  const { food_id, order_id, comment, rating, attachment } = validated.value;

  try {
    const food = await prisma.food.findUnique({ where: { id: BigInt(food_id) } });
    if (!food) {
      return sendApiError(res, 403, 'Food not found');
    }

    const order = await prisma.orders.findFirst({
      where: { id: BigInt(order_id), user_id: userId },
      select: { id: true },
    });
    if (!order) {
      return sendApiError(res, 403, 'Order not found');
    }

    const existing = await prisma.reviews.findFirst({
      where: { food_id, user_id: userId, order_id },
    });
    if (existing) {
      return sendApiError(res, 403, 'Already submitted');
    }

    let attachmentJson: string | null = null;
    if (attachment) {
      const list = Array.isArray(attachment) ? attachment : [attachment];
      attachmentJson = JSON.stringify(list.filter(Boolean));
    }

    await prisma.reviews.create({
      data: {
        food_id,
        user_id: userId,
        order_id,
        comment: comment ?? null,
        rating: BigInt(Math.round(rating)),
        attachment: attachmentJson,
        restaurant_id: Number(food.restaurant_id),
        status: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    await applyReviewToFoodAndRestaurant(food, rating);

    return res.status(200).json({ status: true, msg: 'Review submitted successfully' });
  } catch (e: unknown) {
    return sendApiError(res, 403, errorMessageFromUnknown(e));
  }
};
