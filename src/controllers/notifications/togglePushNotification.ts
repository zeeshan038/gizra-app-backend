import { Request, Response } from 'express';
import prisma from '../../config/database';
import { pushNotificationToggleSchema } from '../../schemas/pushNotificationToggle';
import {
  resolvePushToggleNext,
} from '../../utils/notifications/pushNotificationPreference';

function parseToggleBody(req: Request): { enabled?: boolean } | null {
  const validated = pushNotificationToggleSchema.validate(req.body ?? {}, { stripUnknown: true });
  if (validated.error) {
    return null;
  }
  return validated.value as { enabled?: boolean };
}

export async function toggleConsumerPushNotification(
  req: Request,
  res: Response
): Promise<any> {
  const userId = Number(req.user?.id);
  if (!userId) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const body = parseToggleBody(req);
  if (body == null) {
    return res.status(400).json({ status: false, msg: 'Invalid request body' });
  }

  try {
    const user = await prisma.users.findUnique({
      where: { id: BigInt(userId) },
      select: { is_notification_on: true },
    });
    if (!user) {
      return res.status(404).json({ status: false, msg: 'User not found' });
    }

    const is_notification_on = resolvePushToggleNext(user.is_notification_on, body.enabled);
    await prisma.users.update({
      where: { id: BigInt(userId) },
      data: { is_notification_on, updated_at: new Date() },
    });

    return res.status(200).json({
      status: true,
      msg: `Push notifications ${is_notification_on ? 'enabled' : 'disabled'}`,
      data: { is_notification_on },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
}

export async function toggleVendorPushNotification(
  req: Request,
  res: Response
): Promise<any> {
  const vendorId = Number(req.user?.id);
  if (!vendorId) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const body = parseToggleBody(req);
  if (body == null) {
    return res.status(400).json({ status: false, msg: 'Invalid request body' });
  }

  try {
    const vendor = await prisma.vendors.findUnique({
      where: { id: BigInt(vendorId) },
      select: { is_notification_on: true },
    });
    if (!vendor) {
      return res.status(404).json({ status: false, msg: 'Vendor not found' });
    }

    const is_notification_on = resolvePushToggleNext(vendor.is_notification_on, body.enabled);
    await prisma.vendors.update({
      where: { id: BigInt(vendorId) },
      data: { is_notification_on, updated_at: new Date() },
    });

    return res.status(200).json({
      status: true,
      msg: `Push notifications ${is_notification_on ? 'enabled' : 'disabled'}`,
      data: { is_notification_on },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
}

export async function toggleDeliveryManPushNotification(
  req: Request,
  res: Response
): Promise<any> {
  const dmId = Number(req.user?.id);
  if (!dmId) {
    return res.status(401).json({ status: false, msg: 'Unauthorized' });
  }

  const body = parseToggleBody(req);
  if (body == null) {
    return res.status(400).json({ status: false, msg: 'Invalid request body' });
  }

  try {
    const dm = await prisma.delivery_men.findUnique({
      where: { id: BigInt(dmId) },
      select: { is_notification_on: true },
    });
    if (!dm) {
      return res.status(404).json({ status: false, msg: 'Delivery man not found' });
    }

    const is_notification_on = resolvePushToggleNext(dm.is_notification_on, body.enabled);
    await prisma.delivery_men.update({
      where: { id: BigInt(dmId) },
      data: { is_notification_on, updated_at: new Date() },
    });

    return res.status(200).json({
      status: true,
      msg: `Push notifications ${is_notification_on ? 'enabled' : 'disabled'}`,
      data: { is_notification_on },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Request failed';
    return res.status(500).json({ status: false, msg });
  }
}
