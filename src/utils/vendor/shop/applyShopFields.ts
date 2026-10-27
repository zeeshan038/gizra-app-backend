import prisma from '../../../config/database';
import { RESTAURANT_TRANSLATION_TYPE, VendorRestaurantRow } from '../../../types/vendor/restaurantSetup';
import { normalizeStoredMedia } from '../../mediaStorage';

export type ShopUpdateBody = {
  name: string;
  address: string;
  phone: string;
  logo?: string | null;
  cover_photo?: string | null;
  translations: Array<{
    locale: string;
    name: string;
    address: string;
  }>;
};

async function upsertTranslation(
  restaurantId: number,
  locale: string,
  key: 'name' | 'address',
  value: string
) {
  const existing = await prisma.translations.findFirst({
    where: {
      translationable_type: RESTAURANT_TRANSLATION_TYPE,
      translationable_id: restaurantId,
      locale,
      key,
    },
  });

  if (existing) {
    await prisma.translations.update({
      where: { id: existing.id },
      data: { value, updated_at: new Date() },
    });
    return;
  }

  if (!value) return;

  await prisma.translations.create({
    data: {
      translationable_type: RESTAURANT_TRANSLATION_TYPE,
      translationable_id: restaurantId,
      locale,
      key,
      value,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });
}

export async function applyShopFields(restaurant: VendorRestaurantRow, body: ShopUpdateBody) {
  const rid = Number(restaurant.id);
  const vendorId = Number(restaurant.vendor_id);

  const phoneTaken = await prisma.restaurants.findFirst({
    where: {
      phone: body.phone,
      NOT: { id: restaurant.id },
    },
    select: { id: true },
  });
  if (phoneTaken) {
    return { status: 409, msg: 'Contact number is already in use' } as const;
  }

  const logo = body.logo != null ? normalizeStoredMedia(body.logo, restaurant.logo || '') : restaurant.logo;
  const cover =
    body.cover_photo != null
      ? normalizeStoredMedia(body.cover_photo, restaurant.cover_photo || '')
      : restaurant.cover_photo;

  await prisma.restaurants.update({
    where: { id: restaurant.id },
    data: {
      name: body.name.trim(),
      address: body.address.trim(),
      phone: body.phone.trim(),
      logo: logo || null,
      cover_photo: cover || null,
      updated_at: new Date(),
    },
  });

  for (const row of body.translations) {
    if (!row.locale || row.locale === 'default') continue;
    await upsertTranslation(rid, row.locale, 'name', (row.name || '').trim());
    await upsertTranslation(rid, row.locale, 'address', (row.address || '').trim());
  }

  const userinfo = await prisma.user_infos.findFirst({
    where: { vendor_id: vendorId },
  });
  if (userinfo) {
    await prisma.user_infos.update({
      where: { id: userinfo.id },
      data: {
        f_name: body.name.trim(),
        image: logo || userinfo.image,
        updated_at: new Date(),
      },
    });
  }

  return null;
}
