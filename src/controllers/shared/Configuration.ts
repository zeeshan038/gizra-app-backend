import { Request, Response } from 'express';
import {
  buildAppConfiguration,
  buildConsumerBootstrapConfiguration,
  buildDeliveryManBootstrapConfiguration,
  buildVendorBootstrapConfiguration,
} from '../../utils/config/appConfiguration';

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

async function sendLaunchBootstrap(
  res: Response,
  load: () => Promise<Record<string, unknown>>
): Promise<void> {
  try {
    const payload = await load();
    res.status(200).json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Configuration failed';
    res.status(500).json({ status: false, msg });
  }
}

/**
 * Gizra customer app launch — maintenance + customer force-update fields only (flat JSON).
 * @Route GET /api/consumer/config/bootstrap
 * @Access Public
 */
export async function getConsumerBootstrapConfiguration(
  _req: Request,
  res: Response
): Promise<void> {
  await sendLaunchBootstrap(res, buildConsumerBootstrapConfiguration);
}

/**
 * Vendor (restaurant) app launch — maintenance + restaurant force-update fields only.
 * @Route GET /api/vendor/config/bootstrap
 * @Access Public
 */
export async function getVendorBootstrapConfiguration(
  _req: Request,
  res: Response
): Promise<void> {
  await sendLaunchBootstrap(res, buildVendorBootstrapConfiguration);
}

/**
 * Delivery-man app launch — maintenance + delivery-man force-update fields only.
 * @Route GET /api/delivery-man/config/bootstrap
 * @Access Public
 */
export async function getDeliveryManBootstrapConfiguration(
  _req: Request,
  res: Response
): Promise<void> {
  await sendLaunchBootstrap(res, buildDeliveryManBootstrapConfiguration);
}
