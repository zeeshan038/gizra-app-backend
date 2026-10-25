/**
 * Copy objects referenced in Postgres to R2 when they exist on legacy PHP public storage
 * but are missing from R2 (common after PHP → Node migration).
 *
 *   LEGACY_PUBLIC_BASE_URL=https://backend.gizra.app/storage
 *   npx ts-node scripts/syncMissingMediaFromLegacyPublic.ts           # dry run
 *   npx ts-node scripts/syncMissingMediaFromLegacyPublic.ts --apply   # upload
 */
import dotenv from 'dotenv';
import path from 'path';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import prisma from '../src/config/database';
import { s3 } from '../src/utils/cloudflare';
import { publicFoodMediaUrl, publicMediaUrl, publicRestaurantMediaUrl } from '../src/utils/mediaStorage';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const apply = process.argv.includes('--apply');

function r2KeyFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const base = (process.env.CLOUDFLARE_PUBLIC_URL || '').replace(/\/$/, '');
  if (!base || !url.startsWith(base)) return null;
  return url.slice(base.length + 1);
}

async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function fetchLegacy(base: string, key: string): Promise<Buffer | null> {
  try {
    const res = await fetch(`${base}/${key}`);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function mimeForKey(key: string): string {
  const ext = path.extname(key).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return 'application/octet-stream';
}

async function collectKeys(): Promise<Set<string>> {
  const keys = new Set<string>();

  const [restaurants, foods, categories] = await Promise.all([
    prisma.restaurants.findMany({ select: { logo: true, cover_photo: true } }),
    prisma.food.findMany({ select: { image: true } }),
    prisma.categories.findMany({ select: { image: true } }),
  ]);

  for (const r of restaurants) {
    for (const k of [
      r2KeyFromPublicUrl(publicRestaurantMediaUrl(r.logo, 'logo')),
      r2KeyFromPublicUrl(publicRestaurantMediaUrl(r.cover_photo, 'cover')),
    ]) {
      if (k) keys.add(k);
    }
  }

  for (const f of foods) {
    const k = r2KeyFromPublicUrl(publicFoodMediaUrl(f.image));
    if (k) keys.add(k);
  }

  for (const c of categories) {
    const raw = c.image?.trim();
    if (!raw || raw.startsWith('http')) continue;
    const rel = raw.includes('/') ? raw : `category/${raw}`;
    const k = r2KeyFromPublicUrl(publicMediaUrl(rel));
    if (k) keys.add(k);
  }

  return keys;
}

async function main() {
  const bucket = process.env.CLOUDFLARE_BUCKET_NAME?.trim();
  const legacyBase = process.env.LEGACY_PUBLIC_BASE_URL?.replace(/\/$/, '');
  if (!bucket) {
    console.error('Missing CLOUDFLARE_BUCKET_NAME');
    process.exit(1);
  }
  if (!legacyBase) {
    console.error('Set LEGACY_PUBLIC_BASE_URL (e.g. https://backend.gizra.app/storage)');
    process.exit(1);
  }

  const keys = await collectKeys();
  console.log(`Mode: ${apply ? 'APPLY' : 'dry run'}`);
  console.log(`Legacy: ${legacyBase}`);
  console.log(`Distinct R2 keys from DB: ${keys.size}`);

  let already = 0;
  let wouldUpload = 0;
  let uploaded = 0;
  let notOnLegacy = 0;
  let failed = 0;

  for (const key of keys) {
    if (await objectExists(bucket, key)) {
      already += 1;
      continue;
    }

    const body = await fetchLegacy(legacyBase, key);
    if (!body?.length) {
      notOnLegacy += 1;
      if (notOnLegacy <= 10) console.log(`  missing on legacy: ${key}`);
      continue;
    }

    if (!apply) {
      wouldUpload += 1;
      if (wouldUpload <= 15) console.log(`  would upload: ${key} (${body.length} bytes)`);
      continue;
    }

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: mimeForKey(key),
        })
      );
      uploaded += 1;
      if (uploaded % 25 === 0) console.log(`  uploaded ${uploaded}…`);
    } catch (e) {
      failed += 1;
      console.error(`  FAIL ${key}:`, (e as Error).message);
    }
  }

  console.log('');
  console.log(`Already on R2: ${already}`);
  console.log(`Not found on legacy: ${notOnLegacy}`);
  if (!apply) {
    console.log(`Would upload: ${wouldUpload} (re-run with --apply)`);
  } else {
    console.log(`Uploaded: ${uploaded}`);
    console.log(`Failed: ${failed}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
