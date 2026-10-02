import prisma from '../../config/database';

const cache = new Map<string, string | null>();

/** Order-mode toggles: enabled unless admin explicitly set 0/false (matches vendor setup UI). */
const DEFAULT_ON_WHEN_MISSING = new Set([
  'home_delivery',
  'take_away',
  'instant_order',
  'schedule_order',
]);

export function businessSettingFlagOn(raw: string | null): boolean {
  if (raw === '0' || raw === 'false') return false;
  return raw == null || raw === '1' || raw === 'true';
}

export function clearBusinessSettingsCache(): void {
  cache.clear();
}

export async function getBusinessSetting(key: string): Promise<string | null> {
  if (cache.has(key)) {
    return cache.get(key) ?? null;
  }
  const row = await prisma.business_settings.findFirst({ where: { key } });
  const value = row?.value ?? null;
  cache.set(key, value);
  return value;
}

export async function getBusinessSettingNumber(key: string, fallback = 0): Promise<number> {
  const raw = await getBusinessSetting(key);
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export async function getBusinessSettingFlag(key: string): Promise<boolean> {
  const raw = await getBusinessSetting(key);
  if (DEFAULT_ON_WHEN_MISSING.has(key)) {
    return businessSettingFlagOn(raw);
  }
  return raw === '1' || raw === 'true';
}

export function parseJsonSetting<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
