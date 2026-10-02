import { getMessaging } from 'firebase-admin/messaging';
import { isFirebaseReady } from '../../config/firebase';

export type FcmPushData = {
  title: string;
  description: string;
  order_id?: string | number;
  image?: string;
  type: string;
  order_type?: string;
  order_status?: string;
};

function buildStringData(data: FcmPushData): Record<string, string> {
  return Object.fromEntries(
    Object.entries({
      title: data.title,
      description: data.description,
      order_id: data.order_id,
      type: data.type,
      order_type: data.order_type,
      order_status: data.order_status,
      image: data.image,
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
  } catch (error) {
    console.error('[notify] Firebase Admin send failed', error);
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
  return {
    title: String(data.title),
    body: String(data.description),
    order_id: data.order_id != null ? String(data.order_id) : '',
    type: String(data.type),
    order_type: String(data.order_type ?? ''),
    order_status: String(data.order_status ?? ''),
    image: String(data.image ?? ''),
    sound: 'notification.wav',
  };
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
