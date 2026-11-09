import { getMessaging } from 'firebase-admin/messaging';
import { isFirebaseReady } from '../../config/firebase';

export type FcmPushData = {
  title: string;
  description: string;
  order_id?: string | number;
  restaurant_id?: string | number;
  image?: string;
  type: string;
  order_type?: string;
  order_status?: string;
  processing_time?: string;
  cooking_time_minutes?: string;
  /** Gizra platform order id (same as order_id for delivery jobs). */
  gizra_order_id?: string;
  /** Restaurant POS / ticket number when provided on request-driver. */
  restaurant_order_ref?: string;
  /** Primary label for driver UI — POS ref when set, else gizra_order_id. */
  display_order_number?: string;
  order_source?: string;
  is_manual_dispatch?: string;
};

function buildStringData(data: FcmPushData): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      title: data.title,
      description: data.description,
      order_id: data.order_id,
      restaurant_id: data.restaurant_id,
      type: data.type,
      order_type: data.order_type,
      order_status: data.order_status,
      image: data.image,
      processing_time: data.processing_time,
      cooking_time_minutes: data.cooking_time_minutes,
      gizra_order_id: data.gizra_order_id,
      restaurant_order_ref: data.restaurant_order_ref,
      display_order_number: data.display_order_number,
      order_source: data.order_source,
      is_manual_dispatch: data.is_manual_dispatch,
    })
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => [k, String(v)])
  );
}

async function sendViaFirebaseAdmin(
  target: { token: string } | { topic: string },
  data: FcmPushData
): Promise<boolean> {
  if (!isFirebaseReady) return false;

  const stringData = buildStringData(data);
  try {
    await getMessaging().send({
      ...target,
      notification: {
        title: String(data.title),
        body: String(data.description),
      },
      data: stringData,
      android: { notification: { channelId: 'stackfood', sound: 'notification.wav' } },
      apns: { payload: { aps: { sound: 'notification.wav' } } },
    });
    return true;
  } catch (error: unknown) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: string }).code)
        : '';
    console.error('[notify] Firebase Admin send failed', error);
    if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
      console.warn(
        '[notify] FCM token invalid or expired — vendor must re-open POS and call PUT /api/vendor/fcm-token'
      );
    }
    return false;
  }
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

function legacyDataPayload(data: FcmPushData): Record<string, string> {
  const base: Record<string, string> = {
    title: String(data.title),
    body: String(data.description),
    order_id: data.order_id != null ? String(data.order_id) : '',
    type: String(data.type),
    order_type: String(data.order_type ?? ''),
    order_status: String(data.order_status ?? ''),
    image: String(data.image ?? ''),
    sound: 'notification.wav',
  };
  if (data.gizra_order_id) base.gizra_order_id = data.gizra_order_id;
  if (data.restaurant_order_ref) base.restaurant_order_ref = data.restaurant_order_ref;
  if (data.display_order_number) base.display_order_number = data.display_order_number;
  if (data.order_source) base.order_source = data.order_source;
  if (data.is_manual_dispatch) base.is_manual_dispatch = data.is_manual_dispatch;
  return base;
}

/** Device token — mirrors PHP `send_push_notif_to_device`. */
export async function sendFcmToDevice(token: string, data: FcmPushData): Promise<void> {
  if (!token?.trim()) return;

  if (await sendViaFirebaseAdmin({ token: token.trim() }, data)) return;

  const serverKey = process.env.FCM_SERVER_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (serverKey) {
    await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        Authorization: `key=${serverKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token.trim(),
        priority: 'high',
        data: legacyDataPayload(data),
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

  const accessToken = await getGoogleAccessToken(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!accessToken) return;

  const stringData = buildStringData(data);

  await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token: token.trim(),
        data: stringData,
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

/** Firebase topic — mirrors PHP `send_push_notif_to_topic` (type = order_request, etc.). */
export async function sendFcmToTopic(topic: string, data: FcmPushData): Promise<void> {
  if (!topic?.trim()) return;

  if (await sendViaFirebaseAdmin({ topic: topic.trim() }, data)) return;

  const serverKey = process.env.FCM_SERVER_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (serverKey) {
    await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        Authorization: `key=${serverKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: `/topics/${topic.trim()}`,
        priority: 'high',
        data: legacyDataPayload(data),
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

  const accessToken = await getGoogleAccessToken(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!accessToken) return;

  const stringData = buildStringData(data);

  await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        topic: topic.trim(),
        data: stringData,
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
