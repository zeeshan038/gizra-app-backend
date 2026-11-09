import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { Resend } from 'resend';
import { getBusinessSetting, parseJsonSetting } from '../consumer/businessSettings';

export type AdminMailConfig = {
  status?: string | number | boolean;
  name?: string;
  host?: string;
  driver?: string;
  port?: string | number;
  username?: string;
  email_id?: string;
  encryption?: string;
  password?: string;
};

function mailConfigEnabled(cfg: AdminMailConfig): boolean {
  const s = cfg.status;
  return s === 1 || s === '1' || s === true || s === 'true';
}

function envValue(raw: string | undefined): string {
  const v = raw?.trim() ?? '';
  if (!v || v === 'null') return '';
  return v;
}

/** Laravel / PHP `.env` mail keys (see deliverymain `.env.example` + admin mail_config fields). */
function envSmtpConfig(): AdminMailConfig | null {
  const host = envValue(process.env.SMTP_HOST) || envValue(process.env.MAIL_HOST);
  const port = envValue(process.env.SMTP_PORT) || envValue(process.env.MAIL_PORT);
  const username =
    envValue(process.env.SMTP_USER) ||
    envValue(process.env.SMTP_USERNAME) ||
    envValue(process.env.MAIL_USERNAME);
  const password =
    envValue(process.env.SMTP_PASS) ||
    envValue(process.env.SMTP_PASSWORD) ||
    envValue(process.env.MAIL_PASSWORD);
  const email_id =
    envValue(process.env.SMTP_FROM) ||
    envValue(process.env.MAIL_FROM) ||
    envValue(process.env.MAIL_FROM_ADDRESS) ||
    username;
  if (!host || !port || !username || !password || !email_id) {
    return null;
  }
  const encryption =
    envValue(process.env.SMTP_ENCRYPTION) ||
    envValue(process.env.MAIL_ENCRYPTION) ||
    'tls';
  return {
    status: 1,
    name:
      envValue(process.env.SMTP_FROM_NAME) ||
      envValue(process.env.MAIL_FROM_NAME) ||
      envValue(process.env.APP_NAME) ||
      'Gizra',
    host,
    port,
    username,
    password,
    email_id,
    encryption: encryption === 'null' ? 'tls' : encryption,
    driver: 'smtp',
  };
}

export async function resolveAdminMailConfig(): Promise<AdminMailConfig | null> {
  const raw = await getBusinessSetting('mail_config');
  const fromDb = parseJsonSetting<AdminMailConfig | null>(raw, null);
  if (fromDb && mailConfigEnabled(fromDb) && fromDb.host && fromDb.port && fromDb.username && fromDb.password) {
    const email_id = fromDb.email_id ?? (fromDb as { email?: string }).email;
    return { ...fromDb, email_id };
  }
  const fromEnv = envSmtpConfig();
  if (fromEnv && mailConfigEnabled(fromEnv)) {
    return fromEnv;
  }
  return null;
}

function resendApiKey(): string {
  return envValue(process.env.RESEND_API_KEY);
}

function resendFromAddress(cfg: AdminMailConfig | null): { name: string; address: string } | null {
  const address =
    envValue(process.env.RESEND_FROM) ||
    envValue(process.env.MAIL_FROM_ADDRESS) ||
    envValue(process.env.MAIL_FROM) ||
    envValue(process.env.SMTP_FROM) ||
    cfg?.email_id?.trim() ||
    '';
  if (!address) return null;
  const name =
    envValue(process.env.RESEND_FROM_NAME) ||
    envValue(process.env.MAIL_FROM_NAME) ||
    cfg?.name?.trim() ||
    envValue(process.env.APP_NAME) ||
    'Gizra';
  return { name, address };
}

async function sendResendMail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  const apiKey = resendApiKey();
  if (!apiKey) return false;

  const cfg = await resolveAdminMailConfig();
  const from = resendFromAddress(cfg);
  if (!from) {
    console.error('[mail] Resend configured but no from address (RESEND_FROM or MAIL_FROM_ADDRESS)');
    return false;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: `${from.name} <${from.address}>`,
      to: [params.to],
      subject: params.subject,
      text: params.text,
      html: params.html ?? params.text.replace(/\n/g, '<br/>'),
    });
    if (error) {
      console.error('[mail] Resend send failed:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[mail] Resend send failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

function buildTransportOptions(cfg: AdminMailConfig): SMTPTransport.Options {
  const port = Number(cfg.port);
  const encryption = String(cfg.encryption ?? '').toLowerCase();
  const secure = encryption === 'ssl' || port === 465;

  return {
    host: cfg.host,
    port: Number.isFinite(port) ? port : 587,
    secure,
    auth: {
      user: cfg.username,
      pass: cfg.password,
    },
    ...(encryption === 'tls' && !secure ? { requireTLS: true } : {}),
  };
}

export async function sendSmtpMail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  if (resendApiKey()) {
    const sentViaResend = await sendResendMail(params);
    if (sentViaResend) return true;
    console.warn('[mail] Resend failed; falling back to SMTP if configured');
  }

  const cfg = await resolveAdminMailConfig();
  if (!cfg?.email_id) {
    console.error('[mail] Mail not configured (RESEND_API_KEY + from, admin mail_config, or SMTP_* env)');
    return false;
  }

  try {
    const transporter = nodemailer.createTransport(buildTransportOptions(cfg));
    await transporter.sendMail({
      from: {
        name: cfg.name?.trim() || 'Gizra',
        address: cfg.email_id,
      },
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html ?? params.text.replace(/\n/g, '<br/>'),
    });
    return true;
  } catch (err) {
    console.error('[mail] send failed:', err instanceof Error ? err.message : err);
    return false;
  }
}
