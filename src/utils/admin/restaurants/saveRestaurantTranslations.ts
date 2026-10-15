import prisma from '../../../config/database';
import { RESTAURANT_TRANSLATION_TYPE } from '../../../types/vendor/restaurantSetup';

type LocaleMap = { default: string; en?: string | null; he?: string | null };

export async function saveRestaurantTranslations(
  restaurantId: number,
  names: LocaleMap,
  addresses: LocaleMap
) {
  const now = new Date();
  const rows: {
    translationable_type: string;
    translationable_id: number;
    locale: string;
    key: string;
    value: string;
    created_at: Date;
    updated_at: Date;
  }[] = [];

  for (const locale of ['en', 'he'] as const) {
    const nameVal = names[locale]?.trim();
    if (nameVal) {
      rows.push({
        translationable_type: RESTAURANT_TRANSLATION_TYPE,
        translationable_id: restaurantId,
        locale,
        key: 'name',
        value: nameVal,
        created_at: now,
        updated_at: now,
      });
    }
    const addrVal = addresses[locale]?.trim();
    if (addrVal) {
      rows.push({
        translationable_type: RESTAURANT_TRANSLATION_TYPE,
        translationable_id: restaurantId,
        locale,
        key: 'address',
        value: addrVal,
        created_at: now,
        updated_at: now,
      });
    }
  }

  if (rows.length) {
    await prisma.translations.createMany({ data: rows });
  }
}
