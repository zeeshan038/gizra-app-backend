import prisma from '../../config/database';
import { sendFcmToDevice, type FcmPushData } from './fcm';
import { persistUserNotification } from './persistUserNotification';
import { isRecipientPushOn } from './pushNotificationPreference';

type RegistrationDecision = 'approved' | 'denied';

const COPY = {
  deliveryman: {
    approved: {
      title: 'Registration approved',
      description: 'Your registration has been completed successfully. You can now log in and start delivering.',
      type: 'registration_approval',
    },
    denied: {
      title: 'Registration denied',
      description: 'Your deliveryman registration request was not approved. Please contact support for more information.',
      type: 'registration_deny',
    },
  },
  restaurant: {
    approved: {
      title: 'Registration approved',
      description: 'Your restaurant registration has been approved. You can now access your restaurant panel.',
      type: 'registration_approval',
    },
    denied: {
      title: 'Registration denied',
      description: 'Your restaurant registration request was not approved. Please contact support for more information.',
      type: 'registration_deny',
    },
  },
} as const;

async function pushToTokens(
  tokens: string[],
  payload: FcmPushData,
  owner: { vendor_id?: number; delivery_man_id?: number }
): Promise<void> {
  const unique = [...new Set(tokens.map((t) => t.trim()).filter(Boolean))];
  if (!unique.length) return;

  await persistUserNotification(owner, payload).catch((e) =>
    console.error('[notify] persist registration push failed', e)
  );

  await Promise.all(
    unique.map(async (token) => {
      try {
        await sendFcmToDevice(token, payload);
      } catch (e) {
        console.error('[notify] registration FCM failed', e);
      }
    })
  );
}

/** FCM + inbox row when admin approves or denies a delivery man application. */
export async function sendDeliveryManRegistrationDecisionPush(
  deliveryManId: number,
  decision: RegistrationDecision
): Promise<void> {
  const dm = await prisma.delivery_men.findUnique({
    where: { id: BigInt(deliveryManId) },
    select: { id: true, f_name: true, fcm_token: true, is_notification_on: true },
  });
  if (!dm?.fcm_token?.trim() || !isRecipientPushOn(dm.is_notification_on)) return;

  const copy = COPY.deliveryman[decision];
  const payload: FcmPushData = {
    title: copy.title,
    description: copy.description,
    order_id: '',
    image: '',
    type: copy.type,
  };

  await pushToTokens([dm.fcm_token], payload, { delivery_man_id: deliveryManId });
}

/** FCM + inbox when admin approves vendor (restaurant join request). */
export async function sendVendorRegistrationDecisionPush(
  vendorId: number,
  decision: RegistrationDecision
): Promise<void> {
  const vendor = await prisma.vendors.findUnique({
    where: { id: BigInt(vendorId) },
    select: {
      id: true,
      firebase_token: true,
      fcm_token_web: true,
      is_notification_on: true,
    },
  });
  if (!vendor || !isRecipientPushOn(vendor.is_notification_on)) return;

  const tokens = [vendor.firebase_token, vendor.fcm_token_web].filter(Boolean) as string[];
  if (!tokens.length) return;

  const copy = COPY.restaurant[decision];
  const payload: FcmPushData = {
    title: copy.title,
    description: copy.description,
    order_id: '',
    image: '',
    type: copy.type,
  };

  await pushToTokens(tokens, payload, { vendor_id: vendorId });
}
