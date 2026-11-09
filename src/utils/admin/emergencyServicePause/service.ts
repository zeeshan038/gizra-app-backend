import prisma from '../../../config/database';
import {
  buildEmergencyPauseZoneSummaries,
  customerEmergencyPauseMessage,
  invalidateEmergencyServicePauseCache,
  resolveEmergencyPausedZoneIds,
  selectedEmergencyPauseZoneIds,
  type EmergencyPauseZoneSummary,
} from '../../delivery/emergencyServicePause';

export type AdminEmergencyPausePayload = {
  pause_all: boolean;
  zone_ids: number[];
  notice_message: string | null;
  zones: EmergencyPauseZoneSummary[];
  updated_at: string | null;
  updated_by_admin_id: string | null;
};

function formatIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

function normalizeNotice(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}

async function ensureConfigRow() {
  let row = await prisma.emergency_service_pause_configs.findFirst({
    orderBy: { id: 'asc' },
    include: { zones: { select: { zone_id: true } } },
  });
  if (!row) {
    row = await prisma.emergency_service_pause_configs.create({
      data: {
        pause_all: false,
        pause_gush_etzion: false,
        pause_kiryat_arba_hebron: false,
        notice_message: null,
        created_at: new Date(),
        updated_at: new Date(),
      },
      include: { zones: { select: { zone_id: true } } },
    });
  }
  return row;
}

export async function getAdminEmergencyServicePause(): Promise<{
  config: AdminEmergencyPausePayload;
  effective: {
    any_paused: boolean;
    paused_zone_ids: number[];
    customer_notice: string | null;
  };
}> {
  const row = await ensureConfigRow();
  const zone_ids = await selectedEmergencyPauseZoneIds(row);
  const zones = await buildEmergencyPauseZoneSummaries(row);
  const paused_zone_ids = await resolveEmergencyPausedZoneIds(row);
  const any_paused = paused_zone_ids.length > 0;

  return {
    config: {
      pause_all: row.pause_all,
      zone_ids,
      notice_message: normalizeNotice(row.notice_message),
      zones,
      updated_at: formatIso(row.updated_at),
      updated_by_admin_id:
        row.updated_by_admin_id != null ? row.updated_by_admin_id.toString() : null,
    },
    effective: {
      any_paused,
      paused_zone_ids,
      customer_notice: any_paused ? customerEmergencyPauseMessage(row.notice_message) : null,
    },
  };
}

export async function updateAdminEmergencyServicePause(
  body: {
    pause_all?: boolean;
    zone_ids?: number[];
    notice_message?: string | null;
  },
  adminId: number
): Promise<AdminEmergencyPausePayload> {
  const result = await prisma.$transaction(async (tx) => {
    let config = await tx.emergency_service_pause_configs.findFirst({
      orderBy: { id: 'asc' },
      include: { zones: true },
    });
    if (!config) {
      config = await tx.emergency_service_pause_configs.create({
        data: {
          pause_all: false,
          pause_gush_etzion: false,
          pause_kiryat_arba_hebron: false,
          notice_message: null,
          created_at: new Date(),
          updated_at: new Date(),
        },
        include: { zones: true },
      });
    }

    let pause_all = config.pause_all;
    let notice = config.notice_message;

    if (body.pause_all !== undefined) {
      pause_all = body.pause_all;
    }

    if (body.notice_message !== undefined) {
      notice = normalizeNotice(body.notice_message);
    }

    config = await tx.emergency_service_pause_configs.update({
      where: { id: config.id },
      data: {
        pause_all,
        pause_gush_etzion: false,
        pause_kiryat_arba_hebron: false,
        notice_message: notice,
        updated_at: new Date(),
        updated_by_admin_id: BigInt(adminId),
      },
      include: { zones: true },
    });

    if (body.zone_ids !== undefined && !pause_all) {
      const configId = config.id;
      const ids = [...new Set(body.zone_ids)].filter((n) => Number.isFinite(n) && n > 0);
      const found = await tx.zones.findMany({
        where: { id: { in: ids.map((i) => BigInt(i)) } },
        select: { id: true },
      });
      const allowed = new Set(found.map((z) => Number(z.id)));
      const invalid = ids.filter((id) => !allowed.has(id));
      if (invalid.length) {
        throw new Error(
          `Invalid zone ids: ${invalid.slice(0, 10).join(', ')}${invalid.length > 10 ? '…' : ''}`
        );
      }

      await tx.emergency_service_pause_zones.deleteMany({ where: { config_id: configId } });
      if (ids.length) {
        await tx.emergency_service_pause_zones.createMany({
          data: ids.map((zone_id) => ({
            config_id: configId,
            zone_id: BigInt(zone_id),
            created_at: new Date(),
          })),
        });
      }

      config = await tx.emergency_service_pause_configs.findUniqueOrThrow({
        where: { id: configId },
        include: { zones: true },
      });
    }

    if (pause_all && body.zone_ids === undefined) {
      await tx.emergency_service_pause_zones.deleteMany({ where: { config_id: config.id } });
      config = await tx.emergency_service_pause_configs.findUniqueOrThrow({
        where: { id: config.id },
        include: { zones: true },
      });
    }

    return config;
  });

  invalidateEmergencyServicePauseCache();

  const zone_ids = await selectedEmergencyPauseZoneIds(result);
  const zones = await buildEmergencyPauseZoneSummaries(result);
  return {
    pause_all: result.pause_all,
    zone_ids,
    notice_message: normalizeNotice(result.notice_message),
    zones,
    updated_at: formatIso(result.updated_at),
    updated_by_admin_id:
      result.updated_by_admin_id != null ? result.updated_by_admin_id.toString() : null,
  };
}
