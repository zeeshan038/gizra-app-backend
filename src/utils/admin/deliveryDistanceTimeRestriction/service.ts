import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import {
  FIXED_IANA_TIMEZONE,
  formatMinutesAsHHMM,
  invalidateDeliveryDistanceTimeRestrictionCache,
  parseTimeToMinutes,
  resolveRestrictionEffectiveStatus,
  wallClockMinutesInZone,
} from '../../delivery/deliveryDistanceTimeRestriction';

export type AdminRestrictionPayload = {
  enabled: boolean;
  max_distance_km: number;
  start_time: string;
  end_time: string;
  timezone: string;
  restaurant_ids: number[];
  updated_at: string | null;
  updated_by_admin_id: string | null;
};

function formatIso(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString();
}

export async function getAdminDeliveryDistanceTimeRestriction(): Promise<{
  config: AdminRestrictionPayload;
  effective: {
    status: string;
    in_window: boolean;
    current_time_in_tz: string;
  };
}> {
  let row = await prisma.delivery_distance_time_restriction_configs.findFirst({
    orderBy: { id: 'asc' },
    include: { restaurants: { select: { restaurant_id: true } } },
  });

  if (!row) {
    row = await prisma.delivery_distance_time_restriction_configs.create({
      data: {
        enabled: false,
        max_distance_km: new Prisma.Decimal(10),
        start_time: '16:30',
        end_time: '20:30',
        timezone: FIXED_IANA_TIMEZONE,
        created_at: new Date(),
        updated_at: new Date(),
      },
      include: { restaurants: { select: { restaurant_id: true } } },
    });
  }

  const now = new Date();
  const tz = row.timezone?.trim() || FIXED_IANA_TIMEZONE;
  const eff = resolveRestrictionEffectiveStatus(
    {
      id: row.id,
      enabled: row.enabled,
      max_distance_km: row.max_distance_km,
      start_time: row.start_time,
      end_time: row.end_time,
      timezone: row.timezone,
      created_at: row.created_at,
      updated_at: row.updated_at,
      updated_by_admin_id: row.updated_by_admin_id,
      restaurants: row.restaurants.map((r) => ({ restaurant_id: r.restaurant_id })),
    },
    now
  );

  const currentMin = wallClockMinutesInZone(now, tz);
  const current_time_in_tz = formatMinutesAsHHMM(currentMin);

  let effectiveStatus: string = eff.status;
  if (row.enabled && eff.in_window) {
    effectiveStatus = 'in_window'; // some restaurants may still be unrestricted
  }

  return {
    config: {
      enabled: row.enabled,
      max_distance_km: Number(row.max_distance_km),
      start_time: row.start_time,
      end_time: row.end_time,
      timezone: tz,
      restaurant_ids: row.restaurants.map((r) => Number(r.restaurant_id)),
      updated_at: formatIso(row.updated_at),
      updated_by_admin_id: row.updated_by_admin_id != null ? row.updated_by_admin_id.toString() : null,
    },
    effective: {
      status: effectiveStatus,
      in_window: eff.in_window,
      current_time_in_tz,
    },
  };
}

export async function updateAdminDeliveryDistanceTimeRestriction(
  body: {
    enabled?: boolean;
    max_distance_km?: number;
    start_time?: string;
    end_time?: string;
    timezone?: string;
    restaurant_ids?: number[];
  },
  adminId: number
): Promise<AdminRestrictionPayload> {
  if (body.start_time != null && parseTimeToMinutes(body.start_time) == null) {
    throw new Error('Invalid start_time');
  }
  if (body.end_time != null && parseTimeToMinutes(body.end_time) == null) {
    throw new Error('Invalid end_time');
  }

  const result = await prisma.$transaction(async (tx) => {
    let config = await tx.delivery_distance_time_restriction_configs.findFirst({
      orderBy: { id: 'asc' },
      include: { restaurants: true },
    });

    if (!config) {
      config = await tx.delivery_distance_time_restriction_configs.create({
        data: {
          enabled: body.enabled ?? false,
          max_distance_km: new Prisma.Decimal(body.max_distance_km ?? 10),
          start_time: body.start_time ?? '16:30',
          end_time: body.end_time ?? '20:30',
          timezone: body.timezone?.trim() || FIXED_IANA_TIMEZONE,
          updated_by_admin_id: BigInt(adminId),
          created_at: new Date(),
          updated_at: new Date(),
        },
        include: { restaurants: true },
      });
    } else {
      const updateData: Prisma.delivery_distance_time_restriction_configsUpdateInput = {
        updated_at: new Date(),
        updated_by_admin_id: BigInt(adminId),
      };
      if (body.enabled !== undefined) updateData.enabled = body.enabled;
      if (body.max_distance_km !== undefined) {
        updateData.max_distance_km = new Prisma.Decimal(body.max_distance_km);
      }
      if (body.start_time !== undefined) updateData.start_time = body.start_time;
      if (body.end_time !== undefined) updateData.end_time = body.end_time;
      if (body.timezone !== undefined) updateData.timezone = body.timezone.trim() || FIXED_IANA_TIMEZONE;

      config = await tx.delivery_distance_time_restriction_configs.update({
        where: { id: config.id },
        data: updateData,
        include: { restaurants: true },
      });
    }

    if (!config) {
      throw new Error('Delivery distance time restriction config missing');
    }

    if (body.restaurant_ids !== undefined) {
      const configId = config.id;
      const ids = [...new Set(body.restaurant_ids)].filter((n) => Number.isFinite(n) && n > 0);
      const found = await tx.restaurants.findMany({
        where: { id: { in: ids.map((i) => BigInt(i)) }, status: true },
        select: { id: true },
      });
      const allowed = new Set(found.map((r) => Number(r.id)));
      const invalid = ids.filter((id) => !allowed.has(id));
      if (invalid.length) {
        throw new Error(`Invalid or inactive restaurant ids: ${invalid.slice(0, 10).join(', ')}${invalid.length > 10 ? '…' : ''}`);
      }

      await tx.delivery_distance_time_restriction_restaurants.deleteMany({
        where: { config_id: configId },
      });
      if (ids.length) {
        await tx.delivery_distance_time_restriction_restaurants.createMany({
          data: ids.map((restaurant_id) => ({
            config_id: configId,
            restaurant_id: BigInt(restaurant_id),
            created_at: new Date(),
          })),
        });
      }

      config = await tx.delivery_distance_time_restriction_configs.findUniqueOrThrow({
        where: { id: configId },
        include: { restaurants: true },
      });
    }

    return config;
  });

  invalidateDeliveryDistanceTimeRestrictionCache();

  const tz = result.timezone?.trim() || FIXED_IANA_TIMEZONE;
  return {
    enabled: result.enabled,
    max_distance_km: Number(result.max_distance_km),
    start_time: result.start_time,
    end_time: result.end_time,
    timezone: tz,
    restaurant_ids: result.restaurants.map((r) => Number(r.restaurant_id)),
    updated_at: formatIso(result.updated_at),
    updated_by_admin_id: result.updated_by_admin_id != null ? result.updated_by_admin_id.toString() : null,
  };
}
