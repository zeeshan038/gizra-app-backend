import admin from 'firebase-admin';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

type ServiceAccountLike = admin.ServiceAccount & Record<string, unknown>;

function normalizePrivateKey(serviceAccount: ServiceAccountLike): void {
  const pk = serviceAccount.private_key;
  if (typeof pk === 'string') {
    serviceAccount.private_key = pk.replace(/\\n/g, '\n');
  }
}

function loadServiceAccount(): ServiceAccountLike | null {
  const filePath = process.env.FIREBASE_ADMIN_SDK_PATH?.trim();
  if (filePath) {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) {
      console.warn(`[firebase] Admin SDK file not found: ${resolved}`);
      return null;
    }
    const account = JSON.parse(fs.readFileSync(resolved, 'utf8')) as ServiceAccountLike;
    normalizePrivateKey(account);
    return account;
  }

  const json =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.FIREBASE_ADMIN_SDK_JSON?.trim();
  if (json) {
    const account = JSON.parse(json) as ServiceAccountLike;
    normalizePrivateKey(account);
    return account;
  }

  return null;
}

let initialized = false;

try {
  if (getApps().length === 0) {
    const serviceAccount = loadServiceAccount();
    if (serviceAccount) {
      initializeApp({ credential: cert(serviceAccount) });
      initialized = true;
      console.log('[firebase] Admin SDK initialized.');
    } else {
      console.warn(
        '[firebase] Not configured — set FIREBASE_SERVICE_ACCOUNT_JSON, FIREBASE_ADMIN_SDK_JSON, or FIREBASE_ADMIN_SDK_PATH.'
      );
    }
  } else {
    initialized = true;
  }
} catch (error) {
  console.error('[firebase] Admin SDK initialization error:', error);
}

export const isFirebaseReady = initialized;
export default admin;
