import { Request, Response } from 'express';
import prisma from '../../config/database';
import { adminSendPushNotificationSchema } from '../../schemas/admin/PushNotification';
import {
  fitDbString,
  normalizeStoredMedia,
  resolveAbsoluteNotificationImageUrl,
} from '../../utils/mediaStorage';
import { sendAdminPushBroadcast } from '../../utils/notifications/sendAdminPushBroadcast';
import type { PushBroadcastTarget } from '../../utils/notifications/pushBroadcastTopic';

/**
 * @Description Send admin broadcast push (PHP POST admin notification store)
 * @Route POST /api/admin/push-notifications
 * @Access Admin
 */
export const sendAdminPushNotification = async (req: Request, res: Response): Promise<any> => {
  const validated = adminSendPushNotificationSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({ status: false, msg: validated.error.details[0]?.message ?? 'Invalid body' });
  }

  const { title, description, tergat, image } = validated.value;
  const zoneRaw = validated.value.zone;
  const zoneKey: 'all' | number =
    zoneRaw === 'all' ? 'all' : typeof zoneRaw === 'number' ? zoneRaw : Number(zoneRaw);

  if (zoneKey !== 'all' && (!Number.isFinite(zoneKey) || zoneKey <= 0)) {
    return res.status(400).json({ status: false, msg: 'Invalid zone' });
  }

  if (zoneKey !== 'all') {
    const zoneExists = await prisma.zones.findUnique({
      where: { id: BigInt(zoneKey) },
      select: { id: true },
    });
    if (!zoneExists) {
      return res.status(400).json({ status: false, msg: 'Zone not found' });
    }
  }

  const normalizedImage = image?.trim() ? normalizeStoredMedia(image, '', 191) : '';
  const storedImage = normalizedImage ? fitDbString(normalizedImage, 50) : null;

  const row = await prisma.notifications.create({
    data: {
      title,
      description,
      image: storedImage,
      tergat,
      zone_id: zoneKey === 'all' ? null : zoneKey,
      status: true,
      created_at: new Date(),
      updated_at: new Date(),
    },
  });

  const imageUrl = resolveAbsoluteNotificationImageUrl(image) ?? '';
  if (image?.trim() && !imageUrl) {
    console.warn('[notify] admin push skipped image — not a public HTTPS URL', image);
  }

  const delivery = await sendAdminPushBroadcast(tergat as PushBroadcastTarget, zoneKey, {
    title,
    description,
    type: 'general',
    image: imageUrl || undefined,
  });

  if (!delivery.push_sent) {
    const noDevices = delivery.device_tokens === 0;
    return res.status(201).json({
      status: true,
      msg: noDevices
        ? 'Notification saved but no devices with FCM tokens were found for this audience'
        : 'Notification saved but push delivery failed',
      data: {
        id: row.id.toString(),
        topic: delivery.topic,
        push_sent: false,
        image_url: imageUrl || null,
        device_tokens: delivery.device_tokens,
        devices_delivered: delivery.devices_delivered,
        topic_delivered: delivery.topic_delivered,
      },
    });
  }

  return res.status(201).json({
    status: true,
    msg: 'Notification sent successfully',
    data: {
      id: row.id.toString(),
      topic: delivery.topic,
      push_sent: true,
      image_url: imageUrl || null,
      device_tokens: delivery.device_tokens,
      devices_delivered: delivery.devices_delivered,
      topic_delivered: delivery.topic_delivered,
    },
  });
};
