import prisma from '../../config/database';

type SmsConfig = {
  status?: number | string;
  key?: string;
  user?: string;
  password?: string;
  sender?: string;
  otp_template?: string;
  sid?: string;
  token?: string;
  from?: string;
};

function applyTemplate(template: string | undefined, otp: string): string {
  return (template || 'Your verification code is: #OTP#').replace(/#OTP#/g, otp);
}

function toIsraeliLocal(phone: string): string {
  return phone.replace(/^\+?972/, '0').replace(/[^0-9]/g, '');
}

async function loadSmsConfig(keyName: string): Promise<SmsConfig | null> {
  const row = await prisma.addon_settings.findFirst({
    where: { key_name: keyName, settings_type: 'sms_config', is_active: true },
  });
  if (!row?.live_values && !row?.test_values) return null;
  try {
    const raw = row.mode === 'test' ? row.test_values : row.live_values;
    return JSON.parse(raw ?? '{}') as SmsConfig;
  } catch {
    return null;
  }
}

async function sendSms4Free(phone: string, message: string, config: SmsConfig): Promise<boolean> {
  const res = await fetch('https://www.sms4free.co.il/ApiSMS/v2/SendSMS', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: config.key,
      user: config.user,
      password: config.password,
      sender: config.sender,
      recipient: toIsraeliLocal(phone),
      msg: message,
    }),
  });
  const body = (await res.text()).trim();
  return /^\d+$/.test(body) && Number(body) > 0;
}

async function sendTwilio(phone: string, message: string, config: SmsConfig): Promise<boolean> {
  const sid = config.sid || process.env.TWILIO_ACCOUNT_SID;
  const token = config.token || process.env.TWILIO_AUTH_TOKEN;
  const from = config.from || process.env.TWILIO_FROM;
  if (!sid || !token || !from) return false;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const params = new URLSearchParams({ To: phone, From: from, Body: message });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  return res.ok;
}

/**
 * Sends OTP SMS for consumer / vendor / driver flows.
 * Production: sms4free (addon_settings) → Twilio env → SMS_API_URL.
 * Non-production: logs OTP and returns true.
 */
export async function sendConsumerOtpSms(phone: string, otp: string): Promise<boolean> {
  if (process.env.APP_MODE === 'test' || process.env.NODE_ENV !== 'production') {
    console.info(`[sms] OTP for ${phone}: ${otp}`);
    return true;
  }

  try {
    const sms4free = await loadSmsConfig('sms4free');
    if (sms4free && String(sms4free.status) === '1') {
      const message = applyTemplate(sms4free.otp_template, otp);
      const ok = await sendSms4Free(phone, message, sms4free);
      if (ok) return true;
    }

    const twilio = (await loadSmsConfig('twilio')) ?? {};
    if (
      String(twilio.status ?? 0) === '1' ||
      (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
    ) {
      const message = applyTemplate(twilio.otp_template, otp);
      const ok = await sendTwilio(phone, message, twilio);
      if (ok) return true;
    }

    if (process.env.SMS_API_URL) {
      const res = await fetch(process.env.SMS_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.SMS_API_KEY ? { Authorization: `Bearer ${process.env.SMS_API_KEY}` } : {}),
        },
        body: JSON.stringify({ phone, otp, message: applyTemplate(undefined, otp) }),
      });
      if (res.ok) return true;
    }
  } catch (err) {
    console.error('[sms] send failed', err);
  }

  console.warn('[sms] No SMS gateway succeeded for', phone);
  return false;
}
