import { Request, Response } from 'express';
import { buildAppConfiguration } from '../../utils/config/appConfiguration';

function resolveLocale(req: Request): string | undefined {
  const raw = req.headers['x-localization'];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  return undefined;
}

async function sendConfiguration(req: Request, res: Response): Promise<void> {
  try {
    const locale = resolveLocale(req);
    const payload = await buildAppConfiguration(locale);
    res.status(200).json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Configuration failed';
    res.status(500).json({ status: false, msg });
  }
}

/**
 * App bootstrap config (terms, policies, toggles, app versions) — legacy PHP GET /api/v1/config
 * @Route GET /api/config
 * @Access Public
 */
export const getAppConfiguration = sendConfiguration;

/**
 * Same payload as GET /config — consumer app path alias
 * @Route GET /api/consumer/config
 * @Access Public
 */
export const getConsumerAppConfiguration = sendConfiguration;
