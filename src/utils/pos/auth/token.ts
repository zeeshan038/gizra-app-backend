import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';

export type PosEnvironment = 'sandbox' | 'live';

export type PosApiKeyRecord = {
  id: bigint;
  restaurant_id: Prisma.Decimal;
  name: string;
  key_id: string;
  scopes: string;
  /** Resolved env for this auth attempt */
  environment: string;
  provider: string;
  key_prefix: string | null;
  revoked_at: Date | null;
  sandbox_key_prefix?: string | null;
  live_key_prefix?: string | null;
  sandbox_secret_hash?: string | null;
  live_secret_hash?: string | null;
  secret_hash?: string;
};

const TOKEN_BYTES = 32;

export function resolvePosApiEnv(): PosEnvironment {
  const raw = (process.env.POS_API_ENV || process.env.NODE_ENV || 'development').toLowerCase();
  if (raw === 'production' || raw === 'live' || raw === 'prod') return 'live';
  return 'sandbox';
}

export function generatePosApiToken(environment: PosEnvironment): {
  token: string;
  keyId: string;
  keyPrefix: string;
  secretHash: string;
} {
  const secret = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const keyId = crypto.randomBytes(12).toString('hex');
  const prefixTag = environment === 'sandbox' ? 'gz_test' : 'gz_live';
  const keyPrefix = `${prefixTag}_${keyId.slice(0, 8)}`;
  const token = `${keyPrefix}.${secret}`;
  const secretHash = hashPosToken(token);
  return { token, keyId, keyPrefix, secretHash };
}

export function hashPosToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function parseBearerToken(header: string | undefined): string | null {
  if (!header?.trim()) return null;
  const trimmed = header.trim();
  const match = trimmed.match(/^bearer\s+(\S+)/i);
  if (match?.[1]) return match[1];
  if (trimmed.includes('.')) return trimmed;
  return null;
}

export async function findPosApiKeyByToken(token: string): Promise<PosApiKeyRecord | null> {
  const hash = hashPosToken(token);

  const row = await prisma.partner_api_keys.findFirst({
    where: {
      revoked_at: null,
      OR: [
        { sandbox_secret_hash: hash },
        { live_secret_hash: hash },
        { secret_hash: hash },
      ],
    },
  });
  if (!row) return null;

  let environment: PosEnvironment = 'live';
  let keyPrefix: string | null = row.key_prefix;
  if (row.sandbox_secret_hash === hash) {
    environment = 'sandbox';
    keyPrefix = row.sandbox_key_prefix ?? row.key_prefix;
  } else if (row.live_secret_hash === hash) {
    environment = 'live';
    keyPrefix = row.live_key_prefix ?? row.key_prefix;
  } else if ((row.environment || '').toLowerCase() === 'sandbox') {
    environment = 'sandbox';
  }

  return {
    ...row,
    environment,
    key_prefix: keyPrefix,
  };
}

export async function touchPosApiKeyLastUsed(id: bigint): Promise<void> {
  await prisma.partner_api_keys.update({
    where: { id },
    data: { last_used_at: new Date(), updated_at: new Date() },
  });
}

export function restaurantIdFromKey(key: PosApiKeyRecord): number {
  return Number(key.restaurant_id);
}

export function keyHasScope(key: PosApiKeyRecord, scope: string): boolean {
  try {
    const parsed = JSON.parse(key.scopes) as string[];
    if (!Array.isArray(parsed)) return key.scopes === '*' || key.scopes.includes(scope);
    return parsed.includes('*') || parsed.includes(scope);
  } catch {
    return key.scopes === '*' || key.scopes.split(',').map((s) => s.trim()).includes(scope);
  }
}
