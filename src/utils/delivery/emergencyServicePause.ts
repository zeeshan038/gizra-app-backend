import prisma from '../../config/database';
import { findZonesContainingPoint } from '../zone/db';

export const EMERGENCY_SERVICE_PAUSED_CODE = 'EMERGENCY_SERVICE_PAUSED';

const DEFAULT_NOTICE_MESSAGE =
  'Due to a security situation, ordering is temporarily unavailable in your area. Service will resume automatically when it is safe to do so.';

export type EmergencyServicePauseConfigRow = {
  id: bigint;
  pause_all: boolean;
  pause_gush_etzion: boolean;
  pause_kiryat_arba_hebron: boolean;
  notice_message: string | null;
  created_at: Date | null;
  updated_at: Date | null;
  updated_by_admin_id: bigint | null;
  zones: Array<{ zone_id: bigint }>;
};

export type EmergencyPauseZoneSummary = {
  zone_id: number;
  name: string;
  display_name: string | null;
  paused: boolean;
};

let configCache: { row: EmergencyServicePauseConfigRow | null; loadedAt: number } | null = null;
const CONFIG_TTL_MS = 5000;

export function invalidateEmergencyServicePauseCache(): void {
  configCache = null;
}

function normalizeNotice(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}

export function customerEmergencyPauseMessage(notice: string | null | undefined): string {
  return normalizeNotice(notice) ?? DEFAULT_NOTICE_MESSAGE;
}

async function loadConfigRow(): Promise<EmergencyServicePauseConfigRow | null> {
  const row = await prisma.emergency_service_pause_configs.findFirst({
    orderBy: { id: 'asc' },
    include: { zones: { select: { zone_id: true } } },
  });
  if (!row) return null;
  return row as EmergencyServicePauseConfigRow;
}

export async function getEmergencyServicePauseConfigRow(): Promise<EmergencyServicePauseConfigRow | null> {
  const now = Date.now();
  if (configCache && now - configCache.loadedAt < CONFIG_TTL_MS) {
    return configCache.row;
  }
  const row = await loadConfigRow();
  configCache = { row, loadedAt: now };
  return row;
}

/** Selected zone ids from junction (legacy boolean flags as fallback). */
export async function selectedEmergencyPauseZoneIds(
  config: EmergencyServicePauseConfigRow
): Promise<number[]> {
  const fromJunction = config.zones.map((z) => Number(z.zone_id));
  if (fromJunction.length) {
    return [...new Set(fromJunction)];
  }

  const ids: number[] = [];
  if (config.pause_gush_etzion) {
    const z = await prisma.zones.findUnique({ where: { name: 'gush' }, select: { id: true } });
    if (z) ids.push(Number(z.id));
  }
  if (config.pause_kiryat_arba_hebron) {
    const z = await prisma.zones.findUnique({ where: { name: 'hebron' }, select: { id: true } });
    if (z) ids.push(Number(z.id));
  }
  return [...new Set(ids)];
}

export async function resolveEmergencyPausedZoneIds(
  config: EmergencyServicePauseConfigRow
): Promise<number[]> {
  if (config.pause_all) {
    const rows = await prisma.zones.findMany({ select: { id: true } });
    return rows.map((r) => Number(r.id));
  }
  return selectedEmergencyPauseZoneIds(config);
}

export async function isEmergencyPauseActive(config: EmergencyServicePauseConfigRow): Promise<boolean> {
  if (config.pause_all) return true;
  const selected = await selectedEmergencyPauseZoneIds(config);
  return selected.length > 0;
}

export async function buildEmergencyPauseZoneSummaries(
  config: EmergencyServicePauseConfigRow
): Promise<EmergencyPauseZoneSummary[]> {
  const pausedIds = new Set(await resolveEmergencyPausedZoneIds(config));
  const allZones = await prisma.zones.findMany({
    orderBy: { id: 'asc' },
    select: { id: true, name: true, display_name: true },
  });

  return allZones.map((z) => ({
    zone_id: Number(z.id),
    name: z.name,
    display_name: z.display_name,
    paused: pausedIds.has(Number(z.id)),
  }));
}

export async function evaluateEmergencyServicePause(params: {
  orderType: string;
  restaurantZoneId?: number | bigint | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
}): Promise<{
  blocked: boolean;
  message: string;
  description: string | null;
  paused_zone_id?: number;
}> {
  const config = await getEmergencyServicePauseConfigRow();
  if (!config) {
    return { blocked: false, message: '', description: null };
  }

  const active = await isEmergencyPauseActive(config);
  if (!active) {
    return { blocked: false, message: '', description: null };
  }

  const pausedIds = await resolveEmergencyPausedZoneIds(config);
  if (!pausedIds.length) {
    return { blocked: false, message: '', description: null };
  }

  const message = customerEmergencyPauseMessage(config.notice_message);
  const pausedSet = new Set(pausedIds);

  const restaurantZone =
    params.restaurantZoneId != null && Number.isFinite(Number(params.restaurantZoneId))
      ? Number(params.restaurantZoneId)
      : null;

  if (restaurantZone != null && pausedSet.has(restaurantZone)) {
    return { blocked: true, message, description: message, paused_zone_id: restaurantZone };
  }

  if (params.orderType === 'delivery') {
    const lat = params.destinationLat != null ? Number(params.destinationLat) : NaN;
    const lng = params.destinationLng != null ? Number(params.destinationLng) : NaN;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const zones = await findZonesContainingPoint(lat, lng);
      for (const z of zones) {
        const zid = Number(z.id);
        if (pausedSet.has(zid)) {
          return { blocked: true, message, description: message, paused_zone_id: zid };
        }
      }
    }
  }

  return { blocked: false, message: '', description: null };
}

export type EmergencyServicePausePublicPayload = {
  active: boolean;
  pause_all: boolean;
  message: string | null;
  paused_zone_ids: number[];
  zones: Array<{
    zone_id: number;
    name: string;
    display_name: string | null;
    paused: boolean;
  }>;
};

export async function buildEmergencyServicePausePublicPayload(): Promise<EmergencyServicePausePublicPayload> {
  const config = await getEmergencyServicePauseConfigRow();
  if (!config) {
    return {
      active: false,
      pause_all: false,
      message: null,
      paused_zone_ids: [],
      zones: [],
    };
  }

  const zoneSummaries = await buildEmergencyPauseZoneSummaries(config);
  const paused_zone_ids = await resolveEmergencyPausedZoneIds(config);
  const active = paused_zone_ids.length > 0;

  return {
    active,
    pause_all: config.pause_all,
    message: active ? customerEmergencyPauseMessage(config.notice_message) : null,
    paused_zone_ids,
    zones: zoneSummaries.map((z) => ({
      zone_id: z.zone_id,
      name: z.name,
      display_name: z.display_name,
      paused: z.paused,
    })),
  };
}

export async function emergencyPauseAtCoordinates(
  lat: number,
  lng: number
): Promise<{ active: boolean; message: string | null; paused_zone_id: number | null }> {
  const config = await getEmergencyServicePauseConfigRow();
  if (!config || !(await isEmergencyPauseActive(config))) {
    return { active: false, message: null, paused_zone_id: null };
  }

  const pausedIds = await resolveEmergencyPausedZoneIds(config);
  const pausedSet = new Set(pausedIds);
  if (!pausedSet.size) {
    return { active: false, message: null, paused_zone_id: null };
  }

  const zones = await findZonesContainingPoint(lat, lng);
  for (const z of zones) {
    const zid = Number(z.id);
    if (pausedSet.has(zid)) {
      return {
        active: true,
        message: customerEmergencyPauseMessage(config.notice_message),
        paused_zone_id: zid,
      };
    }
  }

  return { active: false, message: null, paused_zone_id: null };
}
