import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { requireDmIdFromRequest } from '../../utils/deliveryman/orderHelpers';
import { notificationsInboxQuerySchema } from '../../schemas/notificationsInboxQuery';
import {
  deleteOwnedUserNotification,
  getPaginatedNotificationInbox,
  parseNotificationIdParam,
} from '../../utils/notifications/inbox';

/**
 * @Route GET /api/delivery-man/notifications
 * @Access Private (Delivery Man)
 */
export const getNotifications = async (req: Request, res: Response): Promise<any> => {
  const dmId = requireDmIdFromRequest(req);
  if (dmId == null) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const validated = notificationsInboxQuerySchema.validate(req.query, { stripUnknown: true });
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
    const dm = await prisma.delivery_men.findUnique({
      where: { id: BigInt(dmId) },
      select: { zone_id: true },
    });
    if (!dm) {
      return res.status(404).json({ status: false, msg: 'Delivery man not found' });
    }

    const zoneIds =
      dm.zone_id != null && Number.isFinite(Number(dm.zone_id)) ? [Number(dm.zone_id)] : null;

    const data = await getPaginatedNotificationInbox({
      tergat: 'deliveryman',
      zoneIds,
      days,
      limit,
      pageNum,
      userNotificationWhere: { delivery_man_id: new Prisma.Decimal(dmId) },
    });

    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route DELETE /api/delivery-man/notifications/:id
 * @Access Private (Delivery Man)
 */
export const deleteNotification = async (req: Request, res: Response): Promise<any> => {
  const dmId = requireDmIdFromRequest(req);
  if (dmId == null) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const id = parseNotificationIdParam(req.params.id);
  if (id == null) {
    return res.status(400).json({ status: false, msg: 'Invalid notification id' });
  }

  try {
    const removed = await deleteOwnedUserNotification(id, {
      delivery_man_id: new Prisma.Decimal(dmId),
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
