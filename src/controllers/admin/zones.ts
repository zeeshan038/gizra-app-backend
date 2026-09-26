import { Request, Response } from 'express';
import prisma from '../../config/database';
import {
  adminAssignRestaurantZoneSchema,
  adminCreateZoneSchema,
  adminUpdateZoneSchema,
} from '../../schemas/admin/Zone';
import {
  formattedCoordinatesFromGeoJson,
  getZoneWithGeoById,
  insertZone,
  listZonesWithGeo,
  updateZonePolygon,
  zoneExists,
} from '../../utils/zone/db';
import { LngLatPair } from '../../utils/zone/geometry';

function mapZoneAdmin(row: Awaited<ReturnType<typeof getZoneWithGeoById>>) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    display_name: row.display_name,
    status: row.status,
    per_km_shipping_charge: row.per_km_shipping_charge,
    minimum_shipping_charge: row.minimum_shipping_charge,
    maximum_shipping_charge: row.maximum_shipping_charge,
    max_cod_order_amount: row.max_cod_order_amount,
    increased_delivery_fee: row.increased_delivery_fee,
    increased_delivery_fee_status: row.increased_delivery_fee_status,
    increase_delivery_charge_message: row.increase_delivery_charge_message,
    restaurant_wise_topic: row.restaurant_wise_topic,
    customer_wise_topic: row.customer_wise_topic,
    deliveryman_wise_topic: row.deliveryman_wise_topic,
    formated_coordinates: formattedCoordinatesFromGeoJson(row.geojson),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * @Description List all zones (PostGIS coordinates as formated_coordinates)
 * @Route GET /api/admin/zones/list
 */
export const listAdminZones = async (req: Request, res: Response): Promise<any> => {
  try {
    const rows = await listZonesWithGeo();
    const data = rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      display_name: row.display_name,
      status: row.status,
      per_km_shipping_charge: row.per_km_shipping_charge,
      minimum_shipping_charge: row.minimum_shipping_charge,
      maximum_shipping_charge: row.maximum_shipping_charge,
      max_cod_order_amount: row.max_cod_order_amount,
      formated_coordinates: formattedCoordinatesFromGeoJson(row.geojson),
      created_at: row.created_at,
    }));
    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Get one zone by id
 * @Route GET /api/admin/zones/detail/:id
 */
export const getAdminZone = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid zone id' });
  }
  try {
    const row = await getZoneWithGeoById(id);
    if (!row) {
      return res.status(404).json({ status: false, msg: 'Zone not found' });
    }
    return res.status(200).json({ status: true, msg: 'Success', data: mapZoneAdmin(row) });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Create zone — polygon as [[lng, lat], ...] (Postman-friendly)
 * @Route POST /api/admin/zones/create
 */
export const createAdminZone = async (req: Request, res: Response): Promise<any> => {
  const validated = adminCreateZoneSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const body = validated.value as {
    name: string;
    display_name?: string | null;
    status?: boolean;
    coordinates: LngLatPair[];
    per_km_shipping_charge?: number;
    minimum_shipping_charge?: number;
    maximum_shipping_charge?: number | null;
    max_cod_order_amount?: number | null;
    increased_delivery_fee?: number;
    increased_delivery_fee_status?: boolean;
    increase_delivery_charge_message?: string | null;
  };

  try {
    const id = await insertZone({
      name: body.name,
      display_name: body.display_name?.trim() ? body.display_name : body.name,
      status: body.status ?? true,
      coordinates: body.coordinates,
      per_km_shipping_charge: body.per_km_shipping_charge ?? 0,
      minimum_shipping_charge: body.minimum_shipping_charge ?? 0,
      maximum_shipping_charge: body.maximum_shipping_charge ?? null,
      max_cod_order_amount: body.max_cod_order_amount ?? null,
      increased_delivery_fee: body.increased_delivery_fee ?? 0,
      increased_delivery_fee_status: body.increased_delivery_fee_status ?? false,
      increase_delivery_charge_message: body.increase_delivery_charge_message ?? null,
    });

    const row = await getZoneWithGeoById(id);
    return res.status(201).json({
      status: true,
      msg: 'Zone created successfully',
      data: mapZoneAdmin(row),
    });
  } catch (e: any) {
    return res.status(400).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Update zone metadata and/or polygon
 * @Route PUT /api/admin/zones/update/:id
 */
export const updateAdminZone = async (req: Request, res: Response): Promise<any> => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ status: false, msg: 'Invalid zone id' });
  }

  const validated = adminUpdateZoneSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const body = validated.value as {
    name?: string;
    display_name?: string | null;
    status?: boolean;
    coordinates?: LngLatPair[];
    per_km_shipping_charge?: number;
    minimum_shipping_charge?: number;
    maximum_shipping_charge?: number | null;
    max_cod_order_amount?: number | null;
    increased_delivery_fee?: number;
    increased_delivery_fee_status?: boolean;
    increase_delivery_charge_message?: string | null;
  };

  try {
    const existing = await prisma.zones.findUnique({ where: { id: BigInt(id) } });
    if (!existing) {
      return res.status(404).json({ status: false, msg: 'Zone not found' });
    }

    if (body.coordinates?.length) {
      await updateZonePolygon(id, body.coordinates);
    }

    await prisma.zones.update({
      where: { id: BigInt(id) },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.display_name !== undefined ? { display_name: body.display_name } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.per_km_shipping_charge !== undefined
          ? { per_km_shipping_charge: body.per_km_shipping_charge }
          : {}),
        ...(body.minimum_shipping_charge !== undefined
          ? { minimum_shipping_charge: body.minimum_shipping_charge }
          : {}),
        ...(body.maximum_shipping_charge !== undefined
          ? { maximum_shipping_charge: body.maximum_shipping_charge }
          : {}),
        ...(body.max_cod_order_amount !== undefined
          ? { max_cod_order_amount: body.max_cod_order_amount }
          : {}),
        ...(body.increased_delivery_fee !== undefined
          ? { increased_delivery_fee: body.increased_delivery_fee }
          : {}),
        ...(body.increased_delivery_fee_status !== undefined
          ? { increased_delivery_fee_status: body.increased_delivery_fee_status }
          : {}),
        ...(body.increase_delivery_charge_message !== undefined
          ? { increase_delivery_charge_message: body.increase_delivery_charge_message }
          : {}),
        updated_at: new Date(),
      },
    });

    const row = await getZoneWithGeoById(id);
    return res.status(200).json({
      status: true,
      msg: 'Zone updated successfully',
      data: mapZoneAdmin(row),
    });
  } catch (e: any) {
    return res.status(400).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Assign a restaurant to a zone
 * @Route PUT /api/admin/zones/restaurant/:restaurantId
 */
export const assignRestaurantZone = async (req: Request, res: Response): Promise<any> => {
  const restaurantId = Number(req.params.restaurantId);
  if (!Number.isFinite(restaurantId)) {
    return res.status(400).json({ status: false, msg: 'Invalid restaurant id' });
  }

  const validated = adminAssignRestaurantZoneSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(','),
    });
  }

  const { zone_id } = validated.value as { zone_id: number };

  try {
    if (!(await zoneExists(zone_id))) {
      return res.status(404).json({ status: false, msg: 'Zone not found' });
    }

    const restaurant = await prisma.restaurants.findUnique({
      where: { id: BigInt(restaurantId) },
      select: { id: true },
    });
    if (!restaurant) {
      return res.status(404).json({ status: false, msg: 'Restaurant not found' });
    }

    const updated = await prisma.restaurants.update({
      where: { id: BigInt(restaurantId) },
      data: { zone_id, updated_at: new Date() },
      select: { id: true, name: true, zone_id: true },
    });

    return res.status(200).json({
      status: true,
      msg: 'Restaurant zone updated',
      data: {
        id: updated.id.toString(),
        name: updated.name,
        zone_id: updated.zone_id != null ? Number(updated.zone_id) : null,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};
