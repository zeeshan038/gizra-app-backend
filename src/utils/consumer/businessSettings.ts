import prisma from '../../config/database';

const cache = new Map<string, string | null>();

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
