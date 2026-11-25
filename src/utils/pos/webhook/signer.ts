import crypto from 'crypto';

export function signPosWebhookPayload(rawBody: string, signingSecret: string): string {
  return crypto.createHmac('sha256', signingSecret).update(rawBody).digest('hex');
}

export function buildPosWebhookHeaders(rawBody: string, signingSecret: string, eventId: string) {
  const signature = signPosWebhookPayload(rawBody, signingSecret);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'Gizra-POS-Webhook/1.0',
    'X-Gizra-Event-Id': eventId,
    'X-Gizra-Timestamp': timestamp,
    'X-Gizra-Signature': `sha256=${signature}`,
  };
}
