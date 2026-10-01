import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { getVendorContext } from '../../utils/vendor/context';
import { notificationsInboxQuerySchema } from '../../schemas/notificationsInboxQuery';
import {
  deleteOwnedUserNotification,
  getPaginatedNotificationInbox,
  parseNotificationIdParam,
} from '../../utils/notifications/inbox';

/**
 * @Description Notifications (admin broadcasts + order pushes), paginated
 * @Route GET /api/vendor/notifications
 * @Access Private (Vendor)
 */
export const getNotifications = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
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
    const restaurant = await prisma.restaurants.findUnique({
      where: { id: BigInt(ctx.restaurantId) },
      select: { zone_id: true },
    });

    const zoneIds =
      restaurant?.zone_id != null && Number.isFinite(Number(restaurant.zone_id))
        ? [Number(restaurant.zone_id)]
        : null;

    const data = await getPaginatedNotificationInbox({
      tergat: 'restaurant',
      zoneIds,
      days,
      limit,
      pageNum,
      userNotificationWhere: { vendor_id: new Prisma.Decimal(ctx.vendorId) },
    });

    return res.status(200).json({ status: true, msg: 'Success', data });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
};

/**
 * @Route DELETE /api/vendor/notifications/:id
 * @Access Private (Vendor)
 */
export const deleteNotification = async (req: Request, res: Response): Promise<any> => {
  const ctx = getVendorContext(req);
  if (!ctx) {
    return res.status(403).json({ status: false, msg: 'Restaurant context not found for vendor' });
  }

  const id = parseNotificationIdParam(req.params.id);
  if (id == null) {
    return res.status(400).json({ status: false, msg: 'Invalid notification id' });
  }

  try {
    const removed = await deleteOwnedUserNotification(id, {
      vendor_id: new Prisma.Decimal(ctx.vendorId),
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
