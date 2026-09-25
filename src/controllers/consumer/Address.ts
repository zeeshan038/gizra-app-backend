import { Request, Response } from 'express';
import prisma from '../../config/database';
import { createAddressSchema, updateAddressSchema } from '../../schemas/consumer/Address';
import { findZoneIdByCoordinates } from '../../utils/consumer/zone';

function formatCustomerAddress(row: {
  id: bigint;
  address_type: string;
  contact_person_number: string;
  address: string | null;
  latitude: string | null;
  longitude: string | null;
  user_id: unknown;
  contact_person_name: string | null;
  zone_id: unknown;
  floor: string | null;
  road: string | null;
  house: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}) {
  return {
    id: row.id.toString(),
    address_type: row.address_type,
    contact_person_name: row.contact_person_name,
    contact_person_number: row.contact_person_number,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    floor: row.floor,
    road: row.road,
    house: row.house,
    zone_id: row.zone_id != null ? String(row.zone_id) : null,
    user_id: row.user_id != null ? String(row.user_id) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function requireUserId(req: Request, res: Response): number | null {
  const userId = Number(req.user?.id);
  if (!userId) {
    res.status(401).json({ status: false, msg: 'Unauthorized' });
    return null;
  }
  return userId;
}

/**
 * @Description List saved delivery addresses for the logged-in customer
 * @Route GET /api/consumer/addresses
 */
export const listAddresses = async (req: Request, res: Response): Promise<any> => {
  const userId = requireUserId(req, res);
  if (userId == null) return;

  const limit = Math.min(Number(req.query.limit) || 10, 100);
  const offset = Math.max(Number(req.query.offset) || 1, 1);
  const skip = (offset - 1) * limit;

  try {
    const [total, rows] = await Promise.all([
      prisma.customer_addresses.count({ where: { user_id: userId } }),
      prisma.customer_addresses.findMany({
        where: { user_id: userId },
        orderBy: { id: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return res.status(200).json({
      status: true,
      data: {
        total_size: total,
        limit,
        offset,
        addresses: rows.map(formatCustomerAddress),
      },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Create a delivery address (map / Home / Work / Other)
 * @Route POST /api/consumer/addresses
 */
export const createAddress = async (req: Request, res: Response): Promise<any> => {
  const userId = requireUserId(req, res);
  if (userId == null) return;

  const result = createAddressSchema.validate(req.body, { stripUnknown: true });
  if (result.error) {
    return res.status(400).json({
      status: false,
      msg: result.error.details.map((d) => d.message).join(','),
    });
  }

  const body = result.value;
  let zoneId = body.zone_id as number | undefined;
  if (!zoneId) {
    zoneId = (await findZoneIdByCoordinates(body.latitude, body.longitude)) ?? undefined;
  }
  if (!zoneId) {
    return res.status(403).json({
      status: false,
      msg: 'Service not available in this area',
      code: 'coordinates',
    });
  }

  try {
    const created = await prisma.customer_addresses.create({
      data: {
        user_id: userId,
        contact_person_name: body.contact_person_name,
        contact_person_number: body.contact_person_number,
        address_type: body.address_type,
        address: body.address,
        floor: body.floor ?? null,
        road: body.road ?? null,
        house: body.house ?? null,
        longitude: String(body.longitude),
        latitude: String(body.latitude),
        zone_id: zoneId,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });

    return res.status(201).json({
      status: true,
      msg: 'New address added',
      data: formatCustomerAddress(created),
      zone_ids: [zoneId],
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Update a saved address
 * @Route PUT /api/consumer/addresses/:id
 */
export const updateAddress = async (req: Request, res: Response): Promise<any> => {
  const userId = requireUserId(req, res);
  if (userId == null) return;

  const addressId = Number(req.params.id);
  if (!addressId) {
    return res.status(400).json({ status: false, msg: 'Invalid address id' });
  }

  const result = updateAddressSchema.validate(req.body, { stripUnknown: true });
  if (result.error) {
    return res.status(400).json({
      status: false,
      msg: result.error.details.map((d) => d.message).join(','),
    });
  }

  const body = result.value;
  let zoneId = body.zone_id as number | undefined;
  if (!zoneId) {
    zoneId = (await findZoneIdByCoordinates(body.latitude, body.longitude)) ?? undefined;
  }
  if (!zoneId) {
    return res.status(403).json({
      status: false,
      msg: 'Service not available in this area',
      code: 'coordinates',
    });
  }

  try {
    const existing = await prisma.customer_addresses.findFirst({
      where: { id: BigInt(addressId), user_id: userId },
    });
    if (!existing) {
      return res.status(404).json({ status: false, msg: 'Address not found' });
    }

    const updated = await prisma.customer_addresses.update({
      where: { id: BigInt(addressId) },
      data: {
        contact_person_name: body.contact_person_name,
        contact_person_number: body.contact_person_number,
        address_type: body.address_type,
        address: body.address,
        floor: body.floor ?? null,
        road: body.road ?? null,
        house: body.house ?? null,
        longitude: String(body.longitude),
        latitude: String(body.latitude),
        zone_id: zoneId,
        updated_at: new Date(),
      },
    });

    return res.status(200).json({
      status: true,
      msg: 'Address updated',
      data: formatCustomerAddress(updated),
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};

/**
 * @Description Delete a saved address
 * @Route DELETE /api/consumer/addresses/:id
 */
export const deleteAddress = async (req: Request, res: Response): Promise<any> => {
  const userId = requireUserId(req, res);
  if (userId == null) return;

  const addressId = Number(req.params.id);
  if (!addressId) {
    return res.status(400).json({ status: false, msg: 'Invalid address id' });
  }

  try {
    const existing = await prisma.customer_addresses.findFirst({
      where: { id: BigInt(addressId), user_id: userId },
    });
    if (!existing) {
      return res.status(404).json({ status: false, msg: 'Address not found' });
    }

    await prisma.customer_addresses.delete({ where: { id: BigInt(addressId) } });
    return res.status(200).json({ status: true, msg: 'Address deleted' });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message });
  }
};
