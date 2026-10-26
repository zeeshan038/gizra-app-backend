import bcrypt from 'bcrypt';
import prisma from '../../../config/database';
import { normalizeStoredMedia } from '../../mediaStorage';
import { isPointInZone } from '../../zone/db';
import { syncRestaurantTags } from './syncRestaurantTags';
import { upsertRestaurantTranslations } from './upsertRestaurantTranslations';

export type AdminUpdateRestaurantInput = {
  f_name: string;
  l_name?: string | null;
  phone: string;
  email: string;
  password?: string | null;
  names: { default: string; en?: string | null; he?: string | null };
  addresses: { default: string; en?: string | null; he?: string | null };
  latitude: number;
  longitude: number;
  zone_id: number;
  tax: number;
  minimum_delivery_time: number;
  maximum_delivery_time: number;
  delivery_time_type: 'min' | 'hours';
  cuisine_ids?: number[];
  tags?: string[];
  logo?: string | null;
  cover_photo?: string | null;
};

export async function updateAdminRestaurant(restaurantId: number, payload: AdminUpdateRestaurantInput) {
  if (payload.delivery_time_type === 'min' && payload.minimum_delivery_time < 10) {
    throw new Error('Minimum delivery time should be more than 10 min');
  }

  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(restaurantId) },
  });
  if (!restaurant) {
    throw new Error('Restaurant not found');
  }

  const vendor = await prisma.vendors.findUnique({
    where: { id: BigInt(Number(restaurant.vendor_id)) },
  });
  if (!vendor) {
    throw new Error('Vendor not found');
  }

  const zoneRow = await prisma.zones.findUnique({
    where: { id: BigInt(payload.zone_id) },
    select: { id: true },
  });
  if (!zoneRow) {
    throw new Error('Zone not found');
  }
  const hasCoords = await prisma.$queryRaw<{ ok: boolean }[]>`
    SELECT EXISTS(
      SELECT 1 FROM zones
      WHERE id = ${BigInt(payload.zone_id)}
      AND coordinates IS NOT NULL
    ) AS ok
  `;
  if (hasCoords[0]?.ok) {
    const inZone = await isPointInZone(payload.zone_id, payload.latitude, payload.longitude);
    if (!inZone) {
      throw new Error('Coordinates are outside the selected zone');
    }
  }



  const vendorId = Number(vendor.id);
  const emailConflict = await prisma.vendors.findFirst({
    where: {
      OR: [{ email: payload.email }, { phone: payload.phone }],
      NOT: { id: vendor.id },
    },
  });
  if (emailConflict) {
    throw new Error('Email or phone already exists');
  }

  const restaurantConflict = await prisma.restaurants.findFirst({
    where: {
      OR: [{ email: payload.email }, { phone: payload.phone }],
      NOT: { id: restaurant.id },
    },
  });
  if (restaurantConflict) {
    throw new Error('Restaurant email or phone already exists');
  }

  const deliveryTime = `${payload.minimum_delivery_time}-${payload.maximum_delivery_time}-${payload.delivery_time_type}`;
  const now = new Date();
  const logo = payload.logo
    ? normalizeStoredMedia(payload.logo, restaurant.logo ?? 'default_logo.png')
    : restaurant.logo;
  const coverPhoto = payload.cover_photo
    ? normalizeStoredMedia(payload.cover_photo, restaurant.cover_photo ?? 'default_cover.png')
    : restaurant.cover_photo;

  await prisma.$transaction(async (tx) => {
    const vendorData: {
      f_name: string;
      l_name: string | null;
      email: string;
      phone: string;
      password?: string;
      updated_at: Date;
    } = {
      f_name: payload.f_name,
      l_name: payload.l_name || null,
      email: payload.email,
      phone: payload.phone,
      updated_at: now,
    };
    if (payload.password?.trim()) {
      vendorData.password = await bcrypt.hash(payload.password.trim(), 10);
    }
    await tx.vendors.update({
      where: { id: vendor.id },
      data: vendorData,
    });

    await tx.restaurants.update({
      where: { id: restaurant.id },
      data: {
        name: payload.names.default,
        address: payload.addresses.default,
        phone: payload.phone,
        email: payload.email,
        latitude: String(payload.latitude),
        longitude: String(payload.longitude),
        zone_id: payload.zone_id,
        tax: payload.tax,
        delivery_time: deliveryTime,
        logo,
        cover_photo: coverPhoto,
        updated_at: now,
      },
    });

    const cuisineIds = (payload.cuisine_ids ?? []).filter((id) => Number.isFinite(id));
    await tx.cuisine_restaurant.deleteMany({ where: { restaurant_id: restaurantId } });
    if (cuisineIds.length) {
      await tx.cuisine_restaurant.createMany({
        data: cuisineIds.map((cuisine_id) => ({
          restaurant_id: restaurantId,
          cuisine_id,
        })),
      });
    }

    await tx.restaurant_tag.deleteMany({ where: { restaurant_id: restaurantId } });
  });

  await upsertRestaurantTranslations(restaurantId, payload.names, payload.addresses);
  await syncRestaurantTags(restaurantId, payload.tags ?? []);

  return { restaurant_id: restaurantId, vendor_id: vendorId };
}

export async function setAdminRestaurantStatus(restaurantId: number, status: boolean) {
  const restaurant = await prisma.restaurants.findUnique({
    where: { id: BigInt(restaurantId) },
    select: { id: true },
  });
  if (!restaurant) {
    throw new Error('Restaurant not found');
  }
  await prisma.restaurants.update({
    where: { id: restaurant.id },
    data: { status, updated_at: new Date() },
  });
  return { id: restaurantId, status };
}
