import prisma from '../../../config/database';
import { RESTAURANT_TRANSLATION_TYPE } from '../../../types/vendor/restaurantSetup';

type LocaleMap = { default: string; en?: string | null; he?: string | null };

async function upsertField(
  restaurantId: number,
  locale: string,
  key: 'name' | 'address',
  value: string | null | undefined
) {
  const trimmed = value?.trim() ?? '';
  const existing = await prisma.translations.findFirst({
    where: {
      translationable_type: RESTAURANT_TRANSLATION_TYPE,
      translationable_id: restaurantId,
      locale,
      key,
    },
  });
  if (existing) {
    if (!trimmed) {
      await prisma.translations.delete({ where: { id: existing.id } });
      return;
    }
    await prisma.translations.update({
      where: { id: existing.id },
      data: { value: trimmed, updated_at: new Date() },
    });
    return;
  }
  if (trimmed) {
    const now = new Date();
    await prisma.translations.create({
      data: {
        translationable_type: RESTAURANT_TRANSLATION_TYPE,
        translationable_id: restaurantId,
        locale,
        key,
        value: trimmed,
        created_at: now,
        updated_at: now,
      },
    });
  }
}

export async function upsertRestaurantTranslations(
  restaurantId: number,
  names: LocaleMap,
  addresses: LocaleMap
) {
  for (const locale of ['en', 'he'] as const) {
    await upsertField(restaurantId, locale, 'name', names[locale]);
    await upsertField(restaurantId, locale, 'address', addresses[locale]);
  }
}
