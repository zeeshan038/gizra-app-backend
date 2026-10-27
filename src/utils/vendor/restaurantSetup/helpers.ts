import { RestaurantSetupLanguageOption } from '../../../types/vendor/restaurantSetup';
import { businessSettingFlagOn } from '../../consumer/businessSettings';
import { LANGUAGE_NAMES } from './constants';

export { businessSettingFlagOn };

export function languageLabel(code: string) {
  if (code === 'en') return 'English(EN)';
  if (code === 'he') return 'Hebrew - עברית (HE)';
  const name = LANGUAGE_NAMES[code] || code.toUpperCase();
  return `${name} (${code.toUpperCase()})`;
}

export function asNumber(value: unknown, fallback = 0) {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formatTime(value: Date | string | null | undefined) {
  if (!value) return '';
  if (typeof value === 'string') {
    const match = value.match(/(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : '';
  }
  const match = value.toISOString().match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : '';
}

export function timeToDate(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, h, m, 0));
}

export function toMinutes(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function parseJsonObject(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function parseLanguages(raw: string | null): RestaurantSetupLanguageOption[] {
  const fallback: RestaurantSetupLanguageOption[] = [
    { code: 'en', label: languageLabel('en') },
    { code: 'he', label: languageLabel('he') },
  ];
  if (!raw) return fallback;

  let parsed: unknown = raw;
  for (let i = 0; i < 2 && typeof parsed === 'string'; i += 1) {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      break;
    }
  }
  if (!Array.isArray(parsed)) return fallback;

  const languages = parsed
    .map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return null;
      const row = item as { code?: string; status?: number | string | boolean };
      if (row.status === 0 || row.status === '0' || row.status === false) return null;
      return row.code || null;
    })
    .filter((code): code is string => Boolean(code))
    .map((code) => ({
      code,
      label: languageLabel(code),
    }));

  return languages.length ? languages : fallback;
}

export function metaImageUrl(stored: string | null | undefined) {
  if (!stored) return null;
  if (stored.startsWith('http://') || stored.startsWith('https://')) return stored;
  if (!stored.includes('/')) return null;
  const base = (process.env.CLOUDFLARE_PUBLIC_URL || '').replace(/\/$/, '');
  if (!base) return null;
  return `${base}/${stored.replace(/^\//, '')}`;
}

export function storeMetaImage(incoming: string | null | undefined, current: string | null) {
  if (incoming == null || incoming === '') return current;
  if (incoming.length <= 100) return incoming;
  try {
    const path = new URL(incoming).pathname.replace(/^\//, '');
    if (path.length <= 100) return path;
    const file = path.split('/').pop() || path;
    return file.slice(0, 100);
  } catch {
    return incoming.slice(0, 100);
  }
}

