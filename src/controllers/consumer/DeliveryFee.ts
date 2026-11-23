import { Request, Response } from 'express';
import { sendApiError, joiFirstMessage, errorMessageFromUnknown } from '../../utils/apiErrorResponse';
import { deliveryFeeQuoteQuerySchema } from '../../schemas/consumer/DeliveryFee';
import { quoteDeliveryFeeForDestination } from '../../utils/delivery/quoteDeliveryFee';

/**
 * @Description Quote delivery fee from restaurant to customer coordinates (tiered base + extra km).
 * @Route GET /api/consumer/config/delivery-fee
 * @Access Public
 */
export const getDeliveryFeeQuote = async (req: Request, res: Response): Promise<any> => {
  const validated = deliveryFeeQuoteQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }

  const v = validated.value as {
    restaurant_id: number;
    destination_lat: string | number;
    destination_lng: string | number;
    distance_km?: number;
  };

  try {
    const result = await quoteDeliveryFeeForDestination({
      restaurantId: Number(v.restaurant_id),
      destinationLat: Number(v.destination_lat),
      destinationLng: Number(v.destination_lng),
      applyFreeDelivery: true,
      enforceRestrictions: true,
    });

    if (!result.ok) {
      return res.status(result.status).json({
        status: false,
        msg: result.msg,
        code: result.code,
        description: result.description,
        max_distance_km: result.max_distance_km,
        restriction_end_time: result.restriction_end_time,
        timezone: result.timezone,
        paused_zone_id: result.paused_zone_id,
        restaurant_id: result.restaurant_id,
        distance_km: result.distance_km,
        distance_source: result.distance_source,
      });
    }

    return res.status(200).json({
      restaurant_id: result.restaurant_id,
      distance_km: result.distance_km,
      distance_source: result.distance_source,
      delivery_fee: result.delivery_fee,
      original_delivery_fee: result.original_delivery_fee,
      pricing: result.pricing,
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};
