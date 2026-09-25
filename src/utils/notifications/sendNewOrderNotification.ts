//NPM Packages
import prisma from '../../config/database';

//Vendor
import { publishNewOrderToRestaurant } from '../vendor/order/sseHub';

export type NewOrderPushPayload = {
  order_id: string;
  restaurant_id: number;
  vendor_id: number;
  order_type: string;
  payment_method: string | null;
  order_amount: number;
};

/**
 * Mirrors legacy `Helpers::send_order_notification` for new marketplace orders:
 * - Persists `user_notifications` for the vendor panel
 * - Sends FCM to vendor `firebase_token` (POS / vendor mobile app) when configured
 */
export async function sendNewOrderNotification(payload: NewOrderPushPayload): Promise<void> {
  const data = {
    title: 'New order',
    description: `New order received — Order ID: ${payload.order_id}`,
    order_id: payload.order_id,
    image: '',
    type: 'new_order',
    order_type: payload.order_type,
  };

  publishNewOrderToRestaurant(payload.restaurant_id, {
    order_id: payload.order_id,
    order_amount: payload.order_amount,
    order_type: payload.order_type,
    payment_method: payload.payment_method,
  });

  try {
    await prisma.user_notifications.create({
      data: {
        vendor_id: payload.vendor_id,
        data: JSON.stringify(data),
        status: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  } catch (e) {
    console.error('[notify] failed to save user_notifications', e);
  }

  try {
    const vendor = await prisma.vendors.findUnique({
      where: { id: BigInt(payload.vendor_id) },
      select: { firebase_token: true, fcm_token_web: true },
    });

    const deviceToken = vendor?.firebase_token || vendor?.fcm_token_web;
    if (!deviceToken) {
      return;
    }

    await sendFcmDataMessage(deviceToken, data);
  } catch (e) {
    console.error('[notify] FCM send failed', e);
  }
}

async function sendFcmDataMessage(
  fcmToken: string,
  data: Record<string, string | number>
): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const serverKey = process.env.FCM_SERVER_KEY;

  if (serverKey) {
    await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        Authorization: `key=${serverKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: fcmToken,
        priority: 'high',
        data: {
          title: String(data.title),
          body: String(data.description),
          order_id: String(data.order_id),
          type: String(data.type),
          order_type: String(data.order_type ?? ''),
          sound: 'notification.wav',
        },
        notification: {
          title: String(data.title),
          body: String(data.description),
          sound: 'notification.wav',
        },
      }),
    });
    return;
  }

  if (!projectId || !process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    console.warn('[notify] FCM not configured (set FCM_SERVER_KEY or FIREBASE_* env vars)');
    return;
  }

  // FCM HTTP API (service account JSON in env, single line)
  const accessToken = await getGoogleAccessToken(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!accessToken) return;

  await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token: fcmToken,
        data: Object.fromEntries(
          Object.entries(data).map(([k, v]) => [k, String(v)])
        ),
        notification: {
          title: String(data.title),
          body: String(data.description),
        },
        android: { notification: { channelId: 'stackfood', sound: 'notification.wav' } },
        apns: { payload: { aps: { sound: 'notification.wav' } } },
      },
    }),
  });
}

async function getGoogleAccessToken(serviceAccountJson: string): Promise<string | null> {
  try {
    const creds = JSON.parse(serviceAccountJson);
    const jwt = await import('jsonwebtoken');
    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign(
      {
        iss: creds.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
      },
      creds.private_key,
      { algorithm: 'RS256' }
    );

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}
