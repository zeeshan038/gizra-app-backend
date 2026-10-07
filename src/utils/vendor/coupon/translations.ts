import prisma from '../../../config/database';

const COUPON_TRANSLATION_TYPE = 'App\\Models\\Coupon';

export async function upsertCouponTitleTranslations(
  couponId: bigint,
  titles: { default: string; en?: string; he?: string }
) {
  const now = new Date();
  const translationableId = Number(couponId);
  const entries: Array<{ locale: string; value: string }> = [
    { locale: 'en', value: titles.en?.trim() || titles.default },
    { locale: 'he', value: titles.he?.trim() || titles.default },
  ];

  for (const { locale, value } of entries) {
    if (!value) continue;
    const existing = await prisma.translations.findFirst({
      where: {
        translationable_type: COUPON_TRANSLATION_TYPE,
        translationable_id: translationableId,
        locale,
        key: 'title',
      },
    });
    if (existing) {
      await prisma.translations.update({
        where: { id: existing.id },
        data: { value, updated_at: now },
      });
    } else {
      await prisma.translations.create({
        data: {
          translationable_type: COUPON_TRANSLATION_TYPE,
          translationable_id: translationableId,
          locale,
          key: 'title',
          value,
          created_at: now,
          updated_at: now,
        },
      });
    }
  }
}

export async function deleteCouponTranslations(couponId: bigint) {
  await prisma.translations.deleteMany({
    where: {
      translationable_type: COUPON_TRANSLATION_TYPE,
      translationable_id: Number(couponId),
    },
  });
}

export async function loadCouponTitleTranslations(
  couponId: bigint,
  fallbackTitle: string | null
): Promise<{ default: string; en: string; he: string }> {
  const rows = await prisma.translations.findMany({
    where: {
      translationable_type: COUPON_TRANSLATION_TYPE,
      translationable_id: Number(couponId),
      key: 'title',
      locale: { in: ['en', 'he'] },
    },
  });
  const byLocale = new Map(rows.map((r) => [r.locale, r.value ?? '']));
  const base = fallbackTitle ?? '';
  return {
    default: base,
    en: byLocale.get('en') || base,
    he: byLocale.get('he') || base,
  };
}

export function normalizeDiscountType(value: string): string {
  if (value === 'percentage') return 'percent';
  return value;
}
