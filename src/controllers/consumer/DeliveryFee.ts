import { Request, Response } from 'express';
import { sendApiError, joiFirstMessage, errorMessageFromUnknown } from '../../utils/apiErrorResponse';
import {
  deliveryFeeBatchBodySchema,
  deliveryFeeQuoteQuerySchema,
} from '../../schemas/consumer/DeliveryFee';
import {
  quoteDeliveryFeeForDestination,
  type QuoteDeliveryFeeResult,
  type QuoteDeliveryFeeSuccess,
} from '../../utils/delivery/quoteDeliveryFee';

/** Limit parallel Google Routes calls inside one batch request. */
const BATCH_QUOTE_CONCURRENCY = 6;

type BatchQuoteItem =
  | {
      restaurant_id: number;
      ok: true;
      distance_km: number;
      distance_source: string;
      delivery_fee: number;
      original_delivery_fee: number;
      pricing: QuoteDeliveryFeeSuccess['pricing'];
    }
  | {
      restaurant_id: number;
      ok: false;
      code?: string;
      msg: string;
      retryable?: boolean;
      description?: string | null;
      max_distance_km?: number | null;
      restriction_end_time?: string | null;
      timezone?: string | null;
      paused_zone_id?: number | null;
      distance_km?: number;
      distance_source?: string;
      delivery_fee: null;
    };

function mapQuoteToBatchItem(restaurantId: number, result: QuoteDeliveryFeeResult): BatchQuoteItem {
  if (result.ok) {
    return {
      restaurant_id: result.restaurant_id,
      ok: true,
      distance_km: result.distance_km,
      distance_source: result.distance_source,
      delivery_fee: result.delivery_fee,
      original_delivery_fee: result.original_delivery_fee,
      pricing: result.pricing,
    };
  }

  return {
    restaurant_id: result.restaurant_id ?? restaurantId,
    ok: false,
    code: result.code,
    msg: result.msg,
    retryable: result.retryable,
    description: result.description,
    max_distance_km: result.max_distance_km,
    restriction_end_time: result.restriction_end_time,
    timezone: result.timezone,
    paused_zone_id: result.paused_zone_id,
    distance_km: result.distance_km,
    distance_source: result.distance_source,
    delivery_fee: null,
  };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  }

  const poolSize = Math.min(concurrency, Math.max(items.length, 1));
  await Promise.all(Array.from({ length: poolSize }, () => runWorker()));
  return results;
}

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
        retryable: result.retryable,
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

/**
 * @Description Batch-quote delivery fees for home restaurant cards (same formula as single GET).
 * @Route POST /api/consumer/config/delivery-fee/batch
 * @Access Public
 */
export const postDeliveryFeeBatch = async (req: Request, res: Response): Promise<any> => {
  const validated = deliveryFeeBatchBodySchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }

  const v = validated.value as {
    destination_lat: string | number;
    destination_lng: string | number;
    restaurant_ids: number[];
  };

  const destinationLat = Number(v.destination_lat);
  const destinationLng = Number(v.destination_lng);
  if (!Number.isFinite(destinationLat) || !Number.isFinite(destinationLng)) {
    return sendApiError(res, 403, 'Invalid destination coordinates');
  }

  const restaurantIds = [...new Set(v.restaurant_ids.map((id) => Number(id)).filter((id) => id > 0))];
  if (!restaurantIds.length) {
    return sendApiError(res, 403, 'restaurant_ids must include at least one valid id');
  }

  try {
    const quotes = await mapWithConcurrency(restaurantIds, BATCH_QUOTE_CONCURRENCY, async (restaurantId) => {
      try {
        const result = await quoteDeliveryFeeForDestination({
          restaurantId,
          destinationLat,
          destinationLng,
          applyFreeDelivery: true,
          enforceRestrictions: true,
        });
        return mapQuoteToBatchItem(restaurantId, result);
      } catch (e: unknown) {
        return {
          restaurant_id: restaurantId,
          ok: false as const,
          code: 'DELIVERY_FEE_QUOTE_FAILED',
          msg: errorMessageFromUnknown(e),
          delivery_fee: null,
        };
      }
    });

    return res.status(200).json({
      destination_lat: destinationLat,
      destination_lng: destinationLng,
      quotes,
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};
