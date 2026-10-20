import prisma from '../../../config/database';
import { clearBusinessSettingsCache } from '../../consumer/businessSettings';
import { publicMediaUrl } from '../../mediaStorage';

export async function getSettingsMap(keys?: string[]): Promise<Map<string, string | null>> {
  const rows = keys?.length
    ? await prisma.business_settings.findMany({ where: { key: { in: keys } } })
    : await prisma.business_settings.findMany();
  const map = new Map<string, string | null>();
  for (const row of rows) {
    map.set(row.key, row.value);
  }
  return map;
}

export function settingValue(map: Map<string, string | null>, key: string, fallback: string | null = null): string | null {
  if (!map.has(key)) return fallback;
  return map.get(key) ?? fallback;
}

export function settingFlag(map: Map<string, string | null>, key: string, fallback = false): boolean {
  const raw = settingValue(map, key);
  if (raw == null || raw === '') return fallback;
  return raw === '1' || raw === 'true';
}

export function settingNumber(map: Map<string, string | null>, key: string, fallback: number | null = null): number | null {
  const raw = settingValue(map, key);
  if (raw == null || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function parseJsonValue<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function upsertBusinessSetting(key: string, value: string | null | number | boolean | undefined): Promise<void> {
  let stored: string | null;
  if (value === undefined || value === null) {
    stored = null;
  } else if (typeof value === 'boolean') {
    stored = value ? '1' : '0';
  } else {
    stored = String(value);
  }

  const existing = await prisma.business_settings.findFirst({ where: { key } });
  const now = new Date();
  if (existing) {
    await prisma.business_settings.update({
      where: { id: existing.id },
      data: { value: stored, updated_at: now },
    });
  } else {
    await prisma.business_settings.create({
      data: { key, value: stored, created_at: now, updated_at: now },
    });
  }
}

export async function upsertBusinessSettings(entries: Record<string, string | null | number | boolean | undefined>): Promise<void> {
  for (const [key, value] of Object.entries(entries)) {
    await upsertBusinessSetting(key, value);
  }
  clearBusinessSettingsCache();
}

export async function getDataSettings(type: string, keys?: string[]): Promise<Map<string, string | null>> {
  const rows = await prisma.data_settings.findMany({
    where: {
      type,
      ...(keys?.length ? { key: { in: keys } } : {}),
    },
  });
  const map = new Map<string, string | null>();
  for (const row of rows) {
    map.set(row.key, row.value);
  }
  return map;
}

export async function upsertDataSetting(type: string, key: string, value: string | null): Promise<void> {
  const existing = await prisma.data_settings.findFirst({ where: { type, key } });
  const now = new Date();
  if (existing) {
    await prisma.data_settings.update({
      where: { id: existing.id },
      data: { value, updated_at: now },
    });
  } else {
    await prisma.data_settings.create({
      data: { type, key, value, created_at: now, updated_at: now },
    });
  }
}

export async function upsertPriorityList(name: string, type: string, value: string): Promise<void> {
  const existing = await prisma.priority_lists.findFirst({ where: { name, type } });
  const now = new Date();
  if (existing) {
    await prisma.priority_lists.update({
      where: { id: existing.id },
      data: { value, updated_at: now },
    });
  } else {
    await prisma.priority_lists.create({
      data: { name, type, value, created_at: now, updated_at: now },
    });
  }
}

export async function getPriorityLists(): Promise<
  Array<{ name: string; value: string; type: string }>
> {
  const rows = await prisma.priority_lists.findMany();
  return rows.map((r) => ({ name: r.name, value: r.value, type: r.type }));
}

export function businessMediaUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith('http://') || stored.startsWith('https://')) return stored;
  const path = stored.includes('/') ? stored.replace(/^\//, '') : `business/${stored.replace(/^\//, '')}`;
  return publicMediaUrl(path);
}

export function flag01(value: unknown, fallback = 0): 0 | 1 {
  if (value === true || value === 1 || value === '1' || value === 'true') return 1;
  if (value === false || value === 0 || value === '0' || value === 'false') return 0;
  return fallback as 0 | 1;
}
