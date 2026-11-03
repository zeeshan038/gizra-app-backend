import { Request, Response } from 'express';
import prisma from '../../config/database';
import { adminSendPushNotificationSchema } from '../../schemas/admin/PushNotification';
import { fitDbString, normalizeStoredMedia, publicMediaUrl } from '../../utils/mediaStorage';
import { sendFcmToTopic } from '../../utils/notifications/fcm';
import {
  resolvePushBroadcastTopic,
  type PushBroadcastTarget,
} from '../../utils/notifications/pushBroadcastTopic';

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

  const storedImage = image?.trim()
    ? fitDbString(normalizeStoredMedia(image, '', 50), 50)
    : null;

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

  const topic = resolvePushBroadcastTopic(tergat as PushBroadcastTarget, zoneKey);
  const imageUrl = storedImage ? publicMediaUrl(storedImage) ?? '' : '';

  try {
    await sendFcmToTopic(topic, {
      title,
      description,
      type: 'general',
      image: imageUrl,
    });
  } catch (e) {
    console.error('[notify] admin push broadcast failed', e);
    return res.status(201).json({
      status: true,
      msg: 'Notification saved but push delivery failed',
      data: {
        id: row.id.toString(),
        topic,
        push_sent: false,
      },
    });
  }

  return res.status(201).json({
    status: true,
    msg: 'Notification sent successfully',
    data: {
      id: row.id.toString(),
      topic,
      push_sent: true,
    },
  });
};
