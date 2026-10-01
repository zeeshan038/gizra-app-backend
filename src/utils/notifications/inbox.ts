import { Prisma, notifications, user_notifications } from '@prisma/client';
import prisma from '../../config/database';
import { publicMediaUrl } from '../mediaStorage';
import { paginationSkip } from '../consumer/orderListHelpers';

export type InboxBroadcastTarget = 'deliveryman' | 'restaurant' | 'customer';

export type PaginatedInboxResult = {
  total_size: number;
  limit: number;
  offset: number;
  days: number;
  notifications: Record<string, unknown>[];
};

function broadcastZoneFilter(zoneIds: number[] | null): Prisma.notificationsWhereInput['OR'] {
  if (!zoneIds?.length) {
    return [{ zone_id: null }];
  }
  return [{ zone_id: null }, ...zoneIds.map((z) => ({ zone_id: new Prisma.Decimal(z) }))];
}

function mapBroadcastRow(n: notifications) {
  return {
    id: n.id.toString(),
    title: n.title,
    description: n.description,
    image: n.image,
    status: n.status,
    tergat: n.tergat,
    zone_id: n.zone_id != null ? Number(n.zone_id) : null,
    created_at: n.created_at?.toISOString() ?? null,
    updated_at: n.updated_at?.toISOString() ?? null,
    data: {
      title: n.title,
      description: n.description,
      order_id: '',
      image: n.image,
      type: 'push_notification',
    },
    image_full_url: publicMediaUrl(n.image ?? '') ?? n.image,
    source: 'broadcast' as const,
  };
}

function mapUserRow(row: user_notifications) {
  return {
    id: row.id.toString(),
    data: row.data,
    status: row.status,
    user_id: row.user_id != null ? Number(row.user_id) : null,
    vendor_id: row.vendor_id != null ? Number(row.vendor_id) : null,
    delivery_man_id: row.delivery_man_id != null ? Number(row.delivery_man_id) : null,
    created_at: row.created_at?.toISOString() ?? null,
    updated_at: row.updated_at?.toISOString() ?? null,
    source: 'user_notification' as const,
  };
}

export async function getPaginatedNotificationInbox(input: {
  tergat: InboxBroadcastTarget;
  zoneIds: number[] | null;
  days: number;
  userNotificationWhere: Prisma.user_notificationsWhereInput;
  limit: number;
  pageNum: number;
  /** Customer legacy filters admin rows by `updated_at`. */
  broadcastTimeField?: 'created_at' | 'updated_at';
}): Promise<PaginatedInboxResult> {
  const since = new Date();
  since.setDate(since.getDate() - input.days);

  const broadcastTimeField = input.broadcastTimeField ?? 'created_at';
  const broadcastTimeFilter =
    broadcastTimeField === 'updated_at'
      ? { updated_at: { gte: since } }
      : { created_at: { gte: since } };

  const [broadcasts, userRows] = await Promise.all([
    prisma.notifications.findMany({
      where: {
        status: true,
        tergat: input.tergat,
        ...broadcastTimeFilter,
        OR: broadcastZoneFilter(input.zoneIds),
      },
      orderBy: { created_at: 'desc' },
    }),
    prisma.user_notifications.findMany({
      where: {
        ...input.userNotificationWhere,
        created_at: { gte: since },
      },
      orderBy: { created_at: 'desc' },
    }),
  ]);

  const merged = [...broadcasts.map(mapBroadcastRow), ...userRows.map(mapUserRow)].sort(
    (a, b) => {
      const ta = a.created_at ? Date.parse(String(a.created_at)) : 0;
      const tb = b.created_at ? Date.parse(String(b.created_at)) : 0;
      return tb - ta;
    }
  );

  const skip = paginationSkip(input.limit, input.pageNum);

  return {
    total_size: merged.length,
    limit: input.limit,
    offset: input.pageNum,
    days: input.days,
    notifications: merged.slice(skip, skip + input.limit),
  };
}

export function parseNotificationIdParam(idParam: string | string[] | undefined): bigint | null {
  const idStr = Array.isArray(idParam) ? idParam[0] : idParam;
  if (!idStr || !/^\d+$/.test(idStr)) return null;
  return BigInt(idStr);
}

export async function deleteOwnedUserNotification(
  id: bigint,
  ownerWhere: Prisma.user_notificationsWhereInput
): Promise<boolean> {
  const deleted = await prisma.user_notifications.deleteMany({
    where: { id, ...ownerWhere },
  });
  return deleted.count > 0;
}
