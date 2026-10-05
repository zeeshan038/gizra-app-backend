import { Prisma } from '@prisma/client';
import prisma from '../../config/database';

const DATA_SETTING_TRANSLATION_TYPE = 'App\\Models\\DataSetting';

/** Admin → Business Settings → Pages (StackFood). */
export const ADMIN_LANDING_PAGE_TYPE = 'admin_landing_page';

export const LEGAL_DATA_SETTING_KEYS = new Set([
  'terms_and_conditions',
  'privacy_policy',
  'about_us',
  'refund_policy',
  'cancellation_policy',
  'shipping_policy',
  'refund_policy_status',
  'cancellation_policy_status',
  'shipping_policy_status',
]);

export function normalizeLocale(locale?: string): string {
  const loc = locale?.trim().replace('_', '-');
  return loc && loc.length > 0 ? loc : 'en';
}

async function findDataSettingRow(key: string) {
  if (LEGAL_DATA_SETTING_KEYS.has(key)) {
    const typed = await prisma.data_settings.findFirst({
      where: { key, type: ADMIN_LANDING_PAGE_TYPE },
    });
    if (typed) return typed;
  }
  return prisma.data_settings.findFirst({ where: { key } });
}

async function readTranslationValue(
  dataSettingId: bigint,
  key: string,
  locale: string
): Promise<string | null> {
  const tr = await prisma.translations.findFirst({
    where: {
      translationable_type: DATA_SETTING_TRANSLATION_TYPE,
      translationable_id: new Prisma.Decimal(dataSettingId.toString()),
      locale,
      key,
    },
    select: { value: true },
  });
  if (tr?.value != null && tr.value.length > 0) return tr.value;
  return null;
}

/**
 * Mirrors PHP `HomeController::get_settings` + `get_settings_localization`:
 * - Row in `data_settings` (admin Pages), type `admin_landing_page`
 * - Per-locale HTML in `translations` (optional header X-localization, default `en`)
 * - Falls back to `data_settings.value` when translation missing/empty
 */
export async function getDataSettingLocalized(
  key: string,
  locale?: string
): Promise<string> {
  const row = await findDataSettingRow(key);
  if (!row) return '';

  const loc = normalizeLocale(locale);
  const translated = await readTranslationValue(row.id, key, loc);
  if (translated) return translated;

  if (row.value?.trim()) return row.value;

  // PHP accessor: any loaded translation for this key (try common locales)
  if (!locale) {
    for (const fallbackLoc of ['en', 'he', 'ar']) {
      const t = await readTranslationValue(row.id, key, fallbackLoc);
      if (t) return t;
    }
  }

  return row.value ?? '';
}

export async function getDataSettingRaw(key: string): Promise<string> {
  const row = await findDataSettingRow(key);
  return row?.value ?? '';
}

export async function getDataSettingInt(key: string): Promise<number> {
  const raw = await getDataSettingRaw(key);
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export async function loadJsonDataSetting(
  type: string,
  key: string
): Promise<Record<string, unknown> | unknown[] | null> {
  const row = await prisma.data_settings.findFirst({ where: { type, key } });
  if (!row?.value?.trim()) return null;
  try {
    const parsed = JSON.parse(row.value);
    if (Array.isArray(parsed) && parsed.length === 0) return null;
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}
