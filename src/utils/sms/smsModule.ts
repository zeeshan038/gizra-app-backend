import prisma from '../../config/database';

export type Sms4FreeConfig = {
  status?: number | string;
  key?: string;
  user?: string;
  password?: string;
  sender?: string;
  otp_template?: string;
};

/** Israeli local format — matches PHP `SMS_module::sms4free`. */
export function normalizeIsraeliSmsPhone(phone: string): string {
  let local = phone.replace(/^\+?972/, '0').replace(/[^0-9]/g, '');
  if (local.length === 9 && local[0] === '5') {
    local = `0${local}`;
  }
  return local;
}

export async function loadSms4FreeConfig(): Promise<Sms4FreeConfig | null> {
  const row = await prisma.addon_settings.findFirst({
    where: { key_name: 'sms4free', settings_type: 'sms_config', is_active: true },
  });
  if (!row?.live_values && !row?.test_values) return null;
  try {
    const raw = row.mode === 'test' ? row.test_values : row.live_values;
    return JSON.parse(raw ?? '{}') as Sms4FreeConfig;
  } catch {
    return null;
  }
}

/**
 * PHP `SMS_module::sms4free` — POST body uses `pass`, not `password`.
 * Success: JSON `{ status: 1 }` or legacy numeric body > 0.
 */
export async function sendSms4FreeMessage(
  phone: string,
  message: string,
  config: Sms4FreeConfig
): Promise<boolean> {
  const recipient = normalizeIsraeliSmsPhone(phone);
  if (!recipient || !message.trim()) return false;

  try {
    const res = await fetch('https://api.sms4free.co.il/ApiSMS/v2/SendSMS', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key: config.key,
        user: config.user,
        pass: config.password,
        sender: config.sender,
        recipient,
        msg: message,
      }),
    });

    const text = (await res.text()).trim();
    try {
      const decoded = JSON.parse(text) as { status?: number };
      if (decoded?.status != null) return Number(decoded.status) === 1;
    } catch {
      /* legacy numeric response */
    }
    return /^\d+$/.test(text) && Number(text) > 0;
  } catch (err) {
    console.error('[sms4free] send failed', err);
    return false;
  }
}

/** PHP `SMS_module::send` — sms4free when active. */
export async function sendSmsMessage(phone: string, message: string): Promise<boolean> {
  if (!phone?.trim() || !message?.trim()) return false;

  if (process.env.APP_MODE === 'test' || process.env.NODE_ENV !== 'production') {
    console.info(`[sms] to ${phone}: ${message}`);
    return true;
  }

  const sms4free = await loadSms4FreeConfig();
  if (sms4free && String(sms4free.status) === '1') {
    const ok = await sendSms4FreeMessage(phone, message, sms4free);
    if (ok) return true;
  }

  console.warn('[sms] No active SMS gateway succeeded for', phone);
  return false;
}

export function applyOtpTemplate(template: string | undefined, otp: string): string {
  return (template || 'Your verification code is: #OTP#').replace(/#OTP#/g, otp);
}
