import { Request, Response } from 'express';
import prisma from '../../config/database';
import { sendApiError, joiFirstMessage, errorMessageFromUnknown } from '../../utils/apiErrorResponse';
import {
  distanceQuerySchema,
  extraChargeQuerySchema,
  geocodeQuerySchema,
  placeAutocompleteQuerySchema,
  placeDetailsQuerySchema,
} from '../../schemas/consumer/Places';
import {
  distanceMatrix,
  geocodeLatLng,
  placeAutocomplete,
  placeDetails,
} from '../../utils/consumer/googlePlaces';
import {
  getBusinessSetting,
  parseJsonSetting,
} from '../../utils/consumer/businessSettings';
import { publicMediaUrl } from '../../utils/mediaStorage';

/**
 * @Description Google Places autocomplete (PHP GET /api/v1/config/place-api-autocomplete)
 * @Route GET /api/consumer/config/place-autocomplete
 * @Access Public
 */
export const getPlaceAutocomplete = async (req: Request, res: Response): Promise<any> => {
  const validated = placeAutocompleteQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  try {
    const data = await placeAutocomplete(
      (validated.value as { search_text: string }).search_text
    );
    return res.status(200).json(data);
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Walking distance matrix (PHP GET /api/v1/config/distance-api)
 * @Route GET /api/consumer/config/distance
 * @Access Public
 */
export const getDistance = async (req: Request, res: Response): Promise<any> => {
  const validated = distanceQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  const v = validated.value as {
    origin_lat: string | number;
    origin_lng: string | number;
    destination_lat: string | number;
    destination_lng: string | number;
  };
  try {
    const data = await distanceMatrix({
      originLat: String(v.origin_lat),
      originLng: String(v.origin_lng),
      destinationLat: String(v.destination_lat),
      destinationLng: String(v.destination_lng),
    });
    return res.status(200).json(data);
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Google Place details (PHP GET /api/v1/config/place-api-details)
 * @Route GET /api/consumer/config/place-details
 * @Access Public
 */
export const getPlaceDetails = async (req: Request, res: Response): Promise<any> => {
  const validated = placeDetailsQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  try {
    const data = await placeDetails((validated.value as { placeid: string }).placeid);
    return res.status(200).json(data);
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Reverse geocode (PHP GET /api/v1/config/geocode-api)
 * @Route GET /api/consumer/config/geocode
 * @Access Public
 */
export const getGeocode = async (req: Request, res: Response): Promise<any> => {
  const validated = geocodeQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  const { lat, lng } = validated.value as { lat: string | number; lng: string | number };
  try {
    const data = await geocodeLatLng(String(lat), String(lng));
    return res.status(200).json(data);
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Extra vehicle charge for a delivery distance (PHP GET /api/v1/vehicle/extra_charge)
 * @Route GET /api/consumer/config/extra-charge
 * @Access Public
 */
export const getExtraCharge = async (req: Request, res: Response): Promise<any> => {
  const validated = extraChargeQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return sendApiError(res, 403, joiFirstMessage(validated.error));
  }
  const distance = Number((validated.value as { distance: number }).distance);
  try {
    const vehicle = await prisma.vehicles.findFirst({
      where: {
        status: true,
        starting_coverage_area: { lte: distance },
        maximum_coverage_area: { gte: distance },
      },
      orderBy: { extra_charges: 'asc' },
    });
    const extra_charges = vehicle ? Number(vehicle.extra_charges) : 0;
    return res.status(200).json(extra_charges);
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Active vehicle types (PHP GET /api/v1/get-vehicles)
 * @Route GET /api/consumer/config/vehicles
 * @Access Public
 */
export const getVehicles = async (_req: Request, res: Response): Promise<any> => {
  try {
    const rows = await prisma.vehicles.findMany({
      where: { status: true },
      select: { id: true, type: true },
    });
    return res.status(200).json(
      rows.map((v) => ({ id: v.id.toString(), type: v.type }))
    );
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Enabled digital payment gateways (PHP GET /api/v1/get-PaymentMethods)
 * @Route GET /api/consumer/config/payment-methods
 * @Access Public
 */
export const getPaymentMethods = async (_req: Request, res: Response): Promise<any> => {
  try {
    const digital = parseJsonSetting<{ status?: unknown }>(
      await getBusinessSetting('digital_payment'),
      { status: 0 }
    );
    const digitalOn = Number(digital.status) === 1;
    const methods: Array<{
      gateway: string;
      gateway_title: string;
      gateway_image: string | null;
      gateway_image_full_url: string | null;
    }> = [];

    if (digitalOn) {
      methods.push({
        gateway: 'hyper_pay',
        gateway_title: 'HyperPay',
        gateway_image: null,
        gateway_image_full_url: null,
      });
    }

    const rows = await prisma.addon_settings.findMany({
      where: { is_active: true, settings_type: 'payment_config' },
    });
    for (const row of rows) {
      const valuesRaw = row.mode === 'live' ? row.live_values : row.test_values;
      let status = 0;
      try {
        status = Number(JSON.parse(valuesRaw ?? '{}')?.status ?? 0);
      } catch {
        status = 0;
      }
      if (status !== 1) continue;
      let extra: { gateway_title?: string; gateway_image?: string } = {};
      try {
        extra = JSON.parse(row.additional_data ?? '{}');
      } catch {
        extra = {};
      }
      const gateway = row.key_name ?? 'unknown';
      if (methods.some((m) => m.gateway === gateway)) continue;
      methods.push({
        gateway,
        gateway_title: extra.gateway_title ?? gateway,
        gateway_image: extra.gateway_image ?? null,
        gateway_image_full_url: publicMediaUrl(extra.gateway_image ?? null),
      });
    }

    return res.status(200).json({ status: true, data: methods });
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

/**
 * @Description Offline payment method list (PHP GET /api/v1/offline_payment_method_list)
 * @Route GET /api/consumer/config/offline-payment-methods
 * @Access Public
 */
export const getOfflinePaymentMethods = async (_req: Request, res: Response): Promise<any> => {
  try {
    const rows = await prisma.offline_payment_methods.findMany({
      where: { status: 1 },
      orderBy: { id: 'asc' },
    });
    const data = rows.length
      ? rows.map((row) => ({
          id: row.id.toString(),
          method_name: row.method_name,
          method_fields: safeJson(row.method_fields),
          method_informations: safeJson(row.method_informations),
        }))
      : null;
    return res.status(200).json(data);
  } catch (e: unknown) {
    return sendApiError(res, 500, errorMessageFromUnknown(e));
  }
};

function safeJson(raw: string | null | undefined) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
