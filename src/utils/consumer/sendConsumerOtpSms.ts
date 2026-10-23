import {
  applyOtpTemplate,
  loadSms4FreeConfig,
  sendSms4FreeMessage,
  sendSmsMessage,
} from '../sms/smsModule';

type SmsConfig = {
  status?: number | string;
  otp_template?: string;
  sid?: string;
  token?: string;
  from?: string;
};

async function loadTwilioConfig(): Promise<SmsConfig | null> {
  const { default: prisma } = await import('../../config/database');
  const row = await prisma.addon_settings.findFirst({
    where: { key_name: 'twilio', settings_type: 'sms_config', is_active: true },
  });
  if (!row?.live_values && !row?.test_values) return null;
  try {
    const raw = row.mode === 'test' ? row.test_values : row.live_values;
    return JSON.parse(raw ?? '{}') as SmsConfig;
  } catch {
    return null;
  }
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
    const sms4free = await loadSms4FreeConfig();
    if (sms4free && String(sms4free.status) === '1') {
      const message = applyOtpTemplate(sms4free.otp_template, otp);
      const ok = await sendSms4FreeMessage(phone, message, sms4free);
      if (ok) return true;
    }

    const twilio = (await loadTwilioConfig()) ?? {};
    if (
      String(twilio.status ?? 0) === '1' ||
      (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
    ) {
      const message = applyOtpTemplate(twilio.otp_template, otp);
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
        body: JSON.stringify({ phone, otp, message: applyOtpTemplate(undefined, otp) }),
      });
      if (res.ok) return true;
    }
  } catch (err) {
    console.error('[sms] send failed', err);
  }

  console.warn('[sms] No SMS gateway succeeded for', phone);
  return false;
}

/** Generic SMS (order status, etc.) — sms4free only in production via sendSmsMessage. */
export { sendSmsMessage };
