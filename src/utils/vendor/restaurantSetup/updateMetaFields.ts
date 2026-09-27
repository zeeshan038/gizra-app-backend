import prisma from '../../../config/database';
import {
  RESTAURANT_TRANSLATION_TYPE,
  RestaurantMetaUpdateBody,
  VendorRestaurantRow,
} from '../../../types/vendor/restaurantSetup';
import { storeMetaImage } from './helpers';

export async function applyRestaurantMetaFields(
  restaurant: VendorRestaurantRow,
  body: RestaurantMetaUpdateBody
) {
  const rid = Number(restaurant.id);

  await prisma.restaurants.update({
    where: { id: restaurant.id },
    data: {
      meta_title: body.meta_title.trim().slice(0, 100),
      meta_description: body.meta_description.trim(),
      meta_image: storeMetaImage(body.meta_image, restaurant.meta_image),
      updated_at: new Date(),
    },
  });

  for (const row of body.translations || []) {
    if (!row.locale || row.locale === 'default') continue;
    const fields: Array<['meta_title' | 'meta_description', string]> = [
      ['meta_title', row.meta_title || ''],
      ['meta_description', row.meta_description || ''],
    ];
    for (const [key, value] of fields) {
      const existing = await prisma.translations.findFirst({
        where: {
          translationable_type: RESTAURANT_TRANSLATION_TYPE,
          translationable_id: rid,
          locale: row.locale,
          key,
        },
      });
      if (existing) {
        await prisma.translations.update({
          where: { id: existing.id },
          data: { value, updated_at: new Date() },
        });
      } else if (value) {
        await prisma.translations.create({
          data: {
            translationable_type: RESTAURANT_TRANSLATION_TYPE,
            translationable_id: rid,
            locale: row.locale,
            key,
            value,
            created_at: new Date(),
            updated_at: new Date(),
          },
        });
      }
    }
  }
}
