import { Request, Response, NextFunction } from 'express';
import {
  findPosApiKeyByToken,
  keyHasScope,
  parseBearerToken,
  resolvePosApiEnv,
  restaurantIdFromKey,
  touchPosApiKeyLastUsed,
  PosApiKeyRecord,
} from '../utils/pos/auth/token';

declare global {
  namespace Express {
    interface Request {
      posPartner?: {
        key: PosApiKeyRecord;
        restaurantId: number;
        environment: string;
        provider: string;
      };
    }
  }
}

/**
 * Authenticate third-party POS partners via Bearer API token (gz_test_… / gz_live_…).
 * Not vendor JWT — restaurant scope comes from the issued key.
 */
export const verifyPosPartner = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<any> => {
  try {
    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ status: false, msg: 'Missing POS API token' });
    }

    const key = await findPosApiKeyByToken(token);
    if (!key || key.revoked_at) {
      return res.status(401).json({ status: false, msg: 'Invalid or revoked POS API token' });
    }

    const hostEnv = resolvePosApiEnv();
    const keyEnv = (key.environment || 'live').toLowerCase();
    if (keyEnv !== hostEnv) {
      return res.status(403).json({
        status: false,
        msg: `Token environment "${keyEnv}" cannot be used on this "${hostEnv}" host`,
      });
    }

    if (!keyHasScope(key, 'orders:write') && !keyHasScope(key, 'orders:read') && !keyHasScope(key, '*')) {
      return res.status(403).json({ status: false, msg: 'POS token has no order scopes' });
    }

    req.posPartner = {
      key,
      restaurantId: restaurantIdFromKey(key),
      environment: keyEnv,
      provider: key.provider,
    };

    void touchPosApiKeyLastUsed(key.id).catch(() => undefined);
    return next();
  } catch (e: any) {
    console.error('[verifyPosPartner]', e);
    return res.status(500).json({ status: false, msg: 'POS auth failed' });
  }
};

export function requirePosWriteScope(req: Request, res: Response, next: NextFunction): void {
  const key = req.posPartner?.key;
  if (!key || (!keyHasScope(key, 'orders:write') && !keyHasScope(key, '*'))) {
    res.status(403).json({ status: false, msg: 'POS token lacks orders:write scope' });
    return;
  }
  next();
}
