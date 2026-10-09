import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
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

function envSmtpConfig(): AdminMailConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const port = process.env.SMTP_PORT?.trim();
  const username = process.env.SMTP_USER?.trim() ?? process.env.SMTP_USERNAME?.trim();
  const password = process.env.SMTP_PASS?.trim() ?? process.env.SMTP_PASSWORD?.trim();
  const email_id =
    process.env.SMTP_FROM?.trim() ??
    process.env.MAIL_FROM?.trim() ??
    username ??
    '';
  if (!host || !port || !username || !password || !email_id) {
    return null;
  }
  return {
    status: 1,
    name: process.env.SMTP_FROM_NAME?.trim() ?? 'Gizra',
    host,
    port,
    username,
    password,
    email_id,
    encryption: process.env.SMTP_ENCRYPTION?.trim() ?? 'tls',
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
  const cfg = await resolveAdminMailConfig();
  if (!cfg?.email_id) {
    console.error('[mail] SMTP not configured (admin mail_config or SMTP_* env)');
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
