import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { consumerNotificationsInboxQuerySchema } from '../../schemas/notificationsInboxQuery';
import {
  deleteOwnedUserNotification,
  getPaginatedNotificationInbox,
  parseNotificationIdParam,
} from '../../utils/notifications/inbox';
import { parseConsumerZoneIds } from '../../utils/notifications/parseConsumerZoneIds';

/**
 * @Description Notifications (admin broadcasts + order pushes), paginated
 * @Route GET /api/consumer/notifications
 * @Query limit, offset|page, days (default 15), zone_id
 * @Header zoneId — legacy JSON array of zone ids
 * @Access Private (Consumer)
 */
export const getNotifications = async (req: Request, res: Response): Promise<any> => {
  const userId = Number(req.user?.id);
  if (!userId) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const validated = consumerNotificationsInboxQuerySchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const { limit, offset, page, days } = validated.value as {
    limit: number;
    offset: number;
    page?: number;
    days: number;
  };
  const pageNum = page ?? offset;

  try {
    let zoneIds = parseConsumerZoneIds(req);
    if (!zoneIds?.length) {
      const user = await prisma.users.findUnique({
        where: { id: BigInt(userId) },
        select: { zone_id: true },
      });
      if (user?.zone_id != null && Number.isFinite(Number(user.zone_id))) {
        zoneIds = [Number(user.zone_id)];
      }
    }

    const data = await getPaginatedNotificationInbox({
      tergat: 'customer',
      zoneIds,
      days,
      limit,
      pageNum,
      broadcastTimeField: 'updated_at',
      userNotificationWhere: { user_id: new Prisma.Decimal(userId) },
    });

    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route DELETE /api/consumer/notifications/:id
 * @Access Private (Consumer)
 */
export const deleteNotification = async (req: Request, res: Response): Promise<any> => {
  const userId = Number(req.user?.id);
  if (!userId) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const id = parseNotificationIdParam(req.params.id);
  if (id == null) {
    return res.status(400).json({ status: false, msg: 'Invalid notification id' });
  }

  try {
    const removed = await deleteOwnedUserNotification(id, {
      user_id: new Prisma.Decimal(userId),
    });
    if (!removed) {
      return res.status(404).json({ status: false, msg: 'Notification not found' });
    }
    return res.status(200).json({ status: true, msg: 'Notification removed' });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};
