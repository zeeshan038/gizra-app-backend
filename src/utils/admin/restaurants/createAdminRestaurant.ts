import bcrypt from 'bcrypt';
import prisma from '../../../config/database';
import { provisionAccountStorage } from '../../accountStorage';
import { normalizeStoredMedia } from '../../mediaStorage';
import { isPointInZone } from '../../zone/db';
import { RESTAURANT_TRANSLATION_TYPE } from '../../../types/vendor/restaurantSetup';

export type AdminCreateRestaurantInput = {
  f_name: string;
  l_name?: string | null;
  phone: string;
  email: string;
  password: string;
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
  logo: string;
  cover_photo: string;
};

export async function createAdminRestaurant(payload: AdminCreateRestaurantInput) {
  if (payload.delivery_time_type === 'min' && payload.minimum_delivery_time < 10) {
    throw new Error('Minimum delivery time should be more than 10 min');
  }

  const inZone = await isPointInZone(payload.zone_id, payload.latitude, payload.longitude);
  if (!inZone) {
    throw new Error('Coordinates are outside the selected zone');
  }

  const existingVendor = await prisma.vendors.findFirst({
    where: { OR: [{ email: payload.email }, { phone: payload.phone }] },
  });
  if (existingVendor) {
    throw new Error('Email or phone already exists');
  }

  const existingRestaurant = await prisma.restaurants.findFirst({
    where: { OR: [{ email: payload.email }, { phone: payload.phone }] },
  });
  if (existingRestaurant) {
    throw new Error('Restaurant email or phone already exists');
  }

  const hashedPassword = await bcrypt.hash(payload.password, 10);
  const cloudflareId = await provisionAccountStorage('vendor', undefined);

  const logo = normalizeStoredMedia(payload.logo, 'default_logo.png');
  const coverPhoto = normalizeStoredMedia(payload.cover_photo, 'default_cover.png');
  const deliveryTime = `${payload.minimum_delivery_time}-${payload.maximum_delivery_time}-${payload.delivery_time_type}`;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const vendor = await tx.vendors.create({
      data: {
        f_name: payload.f_name,
        l_name: payload.l_name || null,
        email: payload.email,
        phone: payload.phone,
        password: hashedPassword,
        cloudflareId,
        status: true,
        created_at: now,
        updated_at: now,
      },
    });

    const restaurant = await tx.restaurants.create({
      data: {
        name: payload.names.default,
        address: payload.addresses.default,
        phone: payload.phone,
        email: payload.email,
        latitude: String(payload.latitude),
        longitude: String(payload.longitude),
        vendor_id: Number(vendor.id),
        zone_id: payload.zone_id,
        tax: payload.tax,
        delivery_time: deliveryTime,
        restaurant_model: 'none',
        logo,
        cover_photo: coverPhoto,
        status: true,
        active: true,
        created_at: now,
        updated_at: now,
      },
    });

    const rid = Number(restaurant.id);
    const cuisineIds = (payload.cuisine_ids ?? []).filter((id) => Number.isFinite(id));
    if (cuisineIds.length) {
      await tx.cuisine_restaurant.createMany({
        data: cuisineIds.map((cuisine_id) => ({
          restaurant_id: rid,
          cuisine_id,
        })),
      });
    }

    const translationRows: {
      translationable_type: string;
      translationable_id: number;
      locale: string;
      key: string;
      value: string;
      created_at: Date;
      updated_at: Date;
    }[] = [];
    for (const locale of ['en', 'he'] as const) {
      const nameVal = payload.names[locale]?.trim();
      if (nameVal) {
        translationRows.push({
          translationable_type: RESTAURANT_TRANSLATION_TYPE,
          translationable_id: rid,
          locale,
          key: 'name',
          value: nameVal,
          created_at: now,
          updated_at: now,
        });
      }
      const addrVal = payload.addresses[locale]?.trim();
      if (addrVal) {
        translationRows.push({
          translationable_type: RESTAURANT_TRANSLATION_TYPE,
          translationable_id: rid,
          locale,
          key: 'address',
          value: addrVal,
          created_at: now,
          updated_at: now,
        });
      }
    }
    if (translationRows.length) {
      await tx.translations.createMany({ data: translationRows });
    }

    const tagLabels = [...new Set((payload.tags ?? []).map((t) => t.trim()).filter(Boolean))];
    for (const label of tagLabels) {
      let tag = await tx.tags.findFirst({ where: { tag: label } });
      if (!tag) {
        tag = await tx.tags.create({
          data: { tag: label, created_at: now, updated_at: now },
        });
      }
      await tx.restaurant_tag.create({
        data: { restaurant_id: rid, tag_id: Number(tag.id) },
      });
    }

    return { vendor, restaurant };
  });

  return {
    vendor_id: Number(result.vendor.id),
    restaurant_id: Number(result.restaurant.id),
  };
}
