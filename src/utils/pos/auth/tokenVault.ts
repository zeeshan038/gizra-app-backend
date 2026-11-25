import crypto from 'crypto';

const ALGO = 'aes-256-gcm';

function encryptionKey(): Buffer {
  const secret = process.env.POS_TOKEN_SECRET || process.env.JWT_SECRET || 'gizra-pos-token-secret';
  return crypto.createHash('sha256').update(secret).digest();
}

/** Encrypt POS API token for admin "View" later. */
export function encryptPosToken(plainToken: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plainToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}

export function decryptPosToken(payload: string | null | undefined): string | null {
  if (!payload?.trim()) return null;
  try {
    const [version, ivB64, tagB64, dataB64] = payload.split(':');
    if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv(ALGO, encryptionKey(), Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}
