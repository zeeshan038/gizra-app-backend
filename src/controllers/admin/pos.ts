import crypto from 'crypto';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import {
  createPosApiKeySchema,
  createPosConnectionSchema,
  revokePosApiKeySchema,
  updatePosConnectionSchema,
  viewPosApiKeyTokenSchema,
} from '../../schemas/admin/pos';
import { generatePosApiToken, PosEnvironment } from '../../utils/pos/auth/token';
import { decryptPosToken, encryptPosToken } from '../../utils/pos/auth/tokenVault';
import { replayPosWebhookDelivery } from '../../utils/pos/queue/worker';

function mapPosCredentialRow(row: any) {
  return {
    id: row.id.toString(),
    restaurant_id: Number(row.restaurant_id),
    name: row.name,
    provider: row.provider,
    scopes: row.scopes,
    revoked_at: row.revoked_at,
    last_used_at: row.last_used_at,
    created_at: row.created_at,
    sandbox: {
      key_prefix: row.sandbox_key_prefix || null,
      has_token: Boolean(row.sandbox_token_encrypted || row.sandbox_secret_hash),
      can_view: Boolean(row.sandbox_token_encrypted),
    },
    live: {
      key_prefix: row.live_key_prefix || null,
      has_token: Boolean(row.live_token_encrypted || row.live_secret_hash),
      can_view: Boolean(row.live_token_encrypted),
    },
  };
}

/**
 * @Description Create/rotate sandbox or live token on one restaurant credential row
 * @Route POST /api/admin/pos/api-keys
 * @Access Super Admin
 */
export const createPosApiKey = async (req: Request, res: Response): Promise<any> => {
  const validated = createPosApiKeySchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const { restaurant_id, name, provider, environment, scopes } = validated.value;

  try {
    const restaurant = await prisma.restaurants.findUnique({
      where: { id: BigInt(restaurant_id) },
      select: { id: true, name: true },
    });
    if (!restaurant) {
      return res.status(404).json({ status: false, msg: 'Restaurant not found' });
    }

    const env = environment as PosEnvironment;
    const generated = generatePosApiToken(env);
    const now = new Date();
    const encrypted = encryptPosToken(generated.token);

    // Always reuse the latest credential row for this restaurant (even if previously revoked)
    // so sandbox + live stay on one entry.
    const existing = await prisma.partner_api_keys.findFirst({
      where: {
        restaurant_id: new Prisma.Decimal(restaurant_id),
      },
      orderBy: { id: 'desc' },
    });

    const envData =
      env === 'sandbox'
        ? {
            sandbox_key_id: generated.keyId,
            sandbox_secret_hash: generated.secretHash,
            sandbox_key_prefix: generated.keyPrefix,
            sandbox_token_encrypted: encrypted,
          }
        : {
            live_key_id: generated.keyId,
            live_secret_hash: generated.secretHash,
            live_key_prefix: generated.keyPrefix,
            live_token_encrypted: encrypted,
          };

    let row;
    if (existing) {
      row = await prisma.partner_api_keys.update({
        where: { id: existing.id },
        data: {
          name: name || existing.name,
          provider: provider || existing.provider,
          scopes: JSON.stringify(scopes),
          environment: 'both',
          revoked_at: null,
          // Keep legacy columns in sync with the env just issued (auth still supports them).
          key_id: generated.keyId,
          secret_hash: generated.secretHash,
          key_prefix: generated.keyPrefix,
          token_encrypted: encrypted,
          ...envData,
          updated_at: now,
        },
      });
    } else {
      row = await prisma.partner_api_keys.create({
        data: {
          restaurant_id: new Prisma.Decimal(restaurant_id),
          name,
          provider,
          scopes: JSON.stringify(scopes),
          environment: 'both',
          key_id: generated.keyId,
          secret_hash: generated.secretHash,
          key_prefix: generated.keyPrefix,
          token_encrypted: encrypted,
          ...envData,
          created_at: now,
          updated_at: now,
        },
      });
    }

    return res.status(existing ? 200 : 201).json({
      status: true,
      msg: existing
        ? `POS ${env} token saved on the restaurant credential. You can View it anytime.`
        : `POS credential created with ${env} token. Add the other environment on the same row.`,
      data: {
        ...mapPosCredentialRow(row),
        restaurant_name: restaurant.name,
        environment: env,
        token: generated.token,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message || 'Failed to create API key' });
  }
};

/**
 * @Description List POS credentials (one row per restaurant; sandbox + live)
 * @Route GET /api/admin/pos/api-keys
 * @Access Super Admin
 */
export const listPosApiKeys = async (req: Request, res: Response): Promise<any> => {
  try {
    const restaurantId = req.query.restaurant_id ? Number(req.query.restaurant_id) : null;
    const rows = await prisma.partner_api_keys.findMany({
      where: {
        revoked_at: null,
        ...(restaurantId != null && Number.isFinite(restaurantId)
          ? { restaurant_id: new Prisma.Decimal(restaurantId) }
          : {}),
      },
      orderBy: { id: 'desc' },
    });

    return res.status(200).json({
      status: true,
      data: rows.map(mapPosCredentialRow),
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message || 'Failed to list API keys' });
  }
};

/**
 * @Description View sandbox or live token for a credential
 * @Route GET /api/admin/pos/api-keys/:id/token?environment=sandbox|live
 * @Access Super Admin
 */
export const viewPosApiKeyToken = async (req: Request, res: Response): Promise<any> => {
  const validated = viewPosApiKeyTokenSchema.validate(req.query, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  try {
    const id = BigInt(String(req.params.id));
    const env = validated.value.environment as PosEnvironment;
    const row = await prisma.partner_api_keys.findUnique({ where: { id } });
    if (!row) {
      return res.status(404).json({ status: false, msg: 'API key not found' });
    }
    if (row.revoked_at) {
      return res.status(400).json({ status: false, msg: 'This credential is revoked' });
    }

    const encrypted =
      env === 'sandbox' ? row.sandbox_token_encrypted : row.live_token_encrypted;
    const prefix = env === 'sandbox' ? row.sandbox_key_prefix : row.live_key_prefix;
    const token = decryptPosToken(encrypted);
    if (!token) {
      return res.status(404).json({
        status: false,
        msg: `No ${env} token available. Generate a ${env} token for this restaurant.`,
      });
    }
    return res.status(200).json({
      status: true,
      data: {
        id: row.id.toString(),
        name: row.name,
        environment: env,
        key_prefix: prefix,
        restaurant_id: Number(row.restaurant_id),
        token,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message || 'Failed to view token' });
  }
};

/**
 * @Description Revoke whole credential or clear one environment token
 * @Route POST /api/admin/pos/api-keys/:id/revoke
 * @Access Super Admin
 */
export const revokePosApiKey = async (req: Request, res: Response): Promise<any> => {
  const validated = revokePosApiKeySchema.validate(req.body || {}, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  try {
    const id = BigInt(String(req.params.id));
    const now = new Date();
    const scope = validated.value.environment as 'sandbox' | 'live' | 'all';

    if (scope === 'all') {
      const row = await prisma.partner_api_keys.update({
        where: { id },
        data: { revoked_at: now, updated_at: now },
      });
      return res.status(200).json({
        status: true,
        msg: 'POS credential revoked',
        data: { id: row.id.toString(), revoked_at: row.revoked_at },
      });
    }

    const clearData =
      scope === 'sandbox'
        ? {
            sandbox_key_id: null,
            sandbox_secret_hash: null,
            sandbox_key_prefix: null,
            sandbox_token_encrypted: null,
            updated_at: now,
          }
        : {
            live_key_id: null,
            live_secret_hash: null,
            live_key_prefix: null,
            live_token_encrypted: null,
            updated_at: now,
          };

    const row = await prisma.partner_api_keys.update({
      where: { id },
      data: clearData,
    });
    return res.status(200).json({
      status: true,
      msg: `POS ${scope} token removed`,
      data: mapPosCredentialRow(row),
    });
  } catch (e: any) {
    if (e?.code === 'P2025') {
      return res.status(404).json({ status: false, msg: 'API key not found' });
    }
    return res.status(500).json({ status: false, msg: e.message || 'Failed to revoke key' });
  }
};

/**
 * @Description Create POS webhook connection (restaurant → partner endpoint)
 * @Route POST /api/admin/pos/connections
 * @Access Super Admin
 */
export const createPosConnection = async (req: Request, res: Response): Promise<any> => {
  const validated = createPosConnectionSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  const body = validated.value;
  try {
    const restaurant = await prisma.restaurants.findUnique({
      where: { id: BigInt(body.restaurant_id) },
      select: { id: true, name: true },
    });
    if (!restaurant) {
      return res.status(404).json({ status: false, msg: 'Restaurant not found' });
    }

    const signingSecret =
      body.signing_secret || crypto.randomBytes(32).toString('base64url');
    const now = new Date();

    const row = await prisma.partner_webhooks.create({
      data: {
        restaurant_id: new Prisma.Decimal(body.restaurant_id),
        url: body.url,
        events: JSON.stringify(body.events),
        signing_secret: signingSecret,
        active: body.active !== false,
        provider: body.provider,
        external_merchant_id: body.external_merchant_id || null,
        created_at: now,
        updated_at: now,
      },
    });

    return res.status(201).json({
      status: true,
      msg: 'POS connection created',
      data: {
        id: row.id.toString(),
        restaurant_id: Number(row.restaurant_id),
        restaurant_name: restaurant.name,
        url: row.url,
        provider: row.provider,
        external_merchant_id: row.external_merchant_id,
        events: body.events,
        active: row.active,
        signing_secret: signingSecret,
        created_at: row.created_at,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message || 'Failed to create connection' });
  }
};

/**
 * @Description List POS webhook connections
 * @Route GET /api/admin/pos/connections
 * @Access Super Admin
 */
export const listPosConnections = async (req: Request, res: Response): Promise<any> => {
  try {
    const restaurantId = req.query.restaurant_id ? Number(req.query.restaurant_id) : null;
    const rows = await prisma.partner_webhooks.findMany({
      where:
        restaurantId != null && Number.isFinite(restaurantId)
          ? { restaurant_id: new Prisma.Decimal(restaurantId) }
          : undefined,
      orderBy: { id: 'desc' },
    });

    return res.status(200).json({
      status: true,
      data: rows.map((row) => ({
        id: row.id.toString(),
        restaurant_id: Number(row.restaurant_id),
        url: row.url,
        provider: row.provider,
        external_merchant_id: row.external_merchant_id,
        events: row.events,
        active: row.active,
        consecutive_failures: Number(row.consecutive_failures),
        disabled_at: row.disabled_at,
        created_at: row.created_at,
        // Do not expose signing_secret in list
      })),
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message || 'Failed to list connections' });
  }
};

/**
 * @Description Update POS connection
 * @Route PATCH /api/admin/pos/connections/:id
 * @Access Super Admin
 */
export const updatePosConnection = async (req: Request, res: Response): Promise<any> => {
  const validated = updatePosConnectionSchema.validate(req.body, { stripUnknown: true });
  if (validated.error) {
    return res.status(400).json({
      status: false,
      msg: validated.error.details.map((d) => d.message).join(', '),
    });
  }

  try {
    const id = BigInt(String(req.params.id));
    const data: Record<string, unknown> = { updated_at: new Date() };
    const body = validated.value;
    if (body.url != null) data.url = body.url;
    if (body.provider != null) data.provider = body.provider;
    if (body.external_merchant_id !== undefined) {
      data.external_merchant_id = body.external_merchant_id || null;
    }
    if (body.events != null) data.events = JSON.stringify(body.events);
    if (body.signing_secret != null) data.signing_secret = body.signing_secret;
    if (body.active != null) {
      data.active = body.active;
      data.disabled_at = body.active ? null : new Date();
    }

    const row = await prisma.partner_webhooks.update({
      where: { id },
      data,
    });

    return res.status(200).json({
      status: true,
      msg: 'POS connection updated',
      data: {
        id: row.id.toString(),
        restaurant_id: Number(row.restaurant_id),
        url: row.url,
        provider: row.provider,
        external_merchant_id: row.external_merchant_id,
        events: row.events,
        active: row.active,
      },
    });
  } catch (e: any) {
    if (e?.code === 'P2025') {
      return res.status(404).json({ status: false, msg: 'Connection not found' });
    }
    return res.status(500).json({ status: false, msg: e.message || 'Failed to update connection' });
  }
};

/**
 * @Description List webhook delivery attempts
 * @Route GET /api/admin/pos/deliveries
 * @Access Super Admin
 */
export const listPosDeliveries = async (req: Request, res: Response): Promise<any> => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const orderId = req.query.order_id ? Number(req.query.order_id) : null;
    const rows = await prisma.partner_webhook_deliveries.findMany({
      where:
        orderId != null && Number.isFinite(orderId)
          ? { order_id: new Prisma.Decimal(orderId) }
          : undefined,
      orderBy: { id: 'desc' },
      take: limit,
    });

    return res.status(200).json({
      status: true,
      data: rows.map((row) => ({
        id: row.id.toString(),
        partner_webhook_id: Number(row.partner_webhook_id),
        delivery_id: row.delivery_id,
        event_id: row.event_id,
        event: row.event,
        order_id: row.order_id != null ? Number(row.order_id) : null,
        attempts: row.attempts,
        last_response_code: row.last_response_code,
        last_error: row.last_error,
        delivered_at: row.delivered_at,
        given_up_at: row.given_up_at,
        next_attempt_at: row.next_attempt_at,
        created_at: row.created_at,
      })),
    });
  } catch (e: any) {
    return res.status(500).json({ status: false, msg: e.message || 'Failed to list deliveries' });
  }
};

/**
 * @Description Replay a failed webhook delivery
 * @Route POST /api/admin/pos/deliveries/:id/replay
 * @Access Super Admin
 */
export const replayPosDelivery = async (req: Request, res: Response): Promise<any> => {
  try {
    const id = BigInt(String(req.params.id));
    await replayPosWebhookDelivery(id);
    return res.status(200).json({ status: true, msg: 'Delivery replay queued/processed' });
  } catch (e: any) {
    if (e?.code === 'P2025') {
      return res.status(404).json({ status: false, msg: 'Delivery not found' });
    }
    return res.status(500).json({ status: false, msg: e.message || 'Replay failed' });
  }
};
