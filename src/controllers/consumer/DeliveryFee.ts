import { Request, Response } from 'express';
import prisma from '../../config/database';
import { sendApiError, joiFirstMessage, errorMessageFromUnknown } from '../../utils/apiErrorResponse';
import { deliveryFeeQuoteQuerySchema } from '../../schemas/consumer/DeliveryFee';
import { resolveDeliveryDistanceKm } from '../../utils/delivery/deliveryDistanceKm';
import { resolveTieredDeliveryPricing } from '../../utils/delivery/resolveDeliveryPricing';
import { computeTieredDeliveryFee } from '../../utils/delivery/tieredDeliveryFee';
import { parseRestaurantCoordinates } from '../../utils/consumer/restaurantDiscoverHelpers';

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

  const destLat = Number(v.destination_lat);
  const destLng = Number(v.destination_lng);
  if (!Number.isFinite(destLat) || !Number.isFinite(destLng)) {
    return sendApiError(res, 403, 'Invalid destination coordinates');
  }

  try {
    const restaurant = await prisma.restaurants.findUnique({
      where: { id: BigInt(v.restaurant_id) },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        zone_id: true,
        self_delivery_system: true,
        minimum_shipping_charge: true,
        base_distance_km: true,
        per_km_shipping_charge: true,
        maximum_shipping_charge: true,
        delivery: true,
        free_delivery: true,
      },
    });

    if (!restaurant) {
      return sendApiError(res, 404, 'Restaurant not found');
    }
    if (!restaurant.delivery) {
      return sendApiError(res, 403, 'Restaurant does not offer delivery');
    }

    const origin = parseRestaurantCoordinates(restaurant.latitude, restaurant.longitude);
    if (!origin) {
      return sendApiError(res, 403, 'Restaurant location is not configured');
    }

    let distance_km: number;
    let distance_source: 'client' | 'google' | 'haversine';

    if (v.distance_km != null && Number.isFinite(v.distance_km)) {
      distance_km = Math.max(0, v.distance_km);
      distance_source = 'client';
    } else {
      const resolved = await resolveDeliveryDistanceKm({
        originLat: origin.latitude,
        originLng: origin.longitude,
        destinationLat: destLat,
        destinationLng: destLng,
      });
      distance_km = resolved.distance_km;
      distance_source = resolved.source;
    }

    const { pricing } = await resolveTieredDeliveryPricing(
      {
        zone_id: restaurant.zone_id,
        self_delivery_system: restaurant.self_delivery_system,
        minimum_shipping_charge: restaurant.minimum_shipping_charge,
        base_distance_km: restaurant.base_distance_km,
        per_km_shipping_charge: restaurant.per_km_shipping_charge,
        maximum_shipping_charge: restaurant.maximum_shipping_charge,
      },
      { latitude: String(destLat), longitude: String(destLng) }
    );

    const breakdown = computeTieredDeliveryFee(distance_km, pricing);

    let delivery_fee = breakdown.delivery_fee;
    let original_delivery_fee = breakdown.delivery_fee;
    if (restaurant.free_delivery) {
      delivery_fee = 0;
    }

    return res.status(200).json({
      restaurant_id: Number(restaurant.id),
      distance_km: breakdown.distance_km,
      distance_source,
      delivery_fee,
      original_delivery_fee,
      pricing: {
        base_fee: breakdown.base_fee,
        base_distance_km: breakdown.base_distance_km,
        extra_per_km: breakdown.extra_per_km,
        extra_km: breakdown.extra_km,
        subtotal_before_surge: breakdown.subtotal_before_surge,
        surge_percent: breakdown.surge_percent,
      },
    });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};
