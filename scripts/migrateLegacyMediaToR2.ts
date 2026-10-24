/**
 * Upload legacy Laravel storage/app/public files to Cloudflare R2 (same keys as PHP: product/…, restaurant/…).
 *
 * Prerequisites: CLOUDFLARE_* in .env (same as production uploads).
 *
 *   LEGACY_STORAGE_ROOT=/path/to/deliverymain/storage/app/public
 *   npm run db:migrate-media-to-r2              # dry run
 *   npm run db:migrate-media-to-r2 -- --apply   # upload missing objects
 *
 * Optional: LEGACY_PUBLIC_BASE_URL=https://old-php-site.com/storage  (fetch if file missing locally)
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { s3 } from '../src/utils/cloudflare';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');

const SKIP_BASENAMES = new Set([
  '.keep',
  '.gitignore',
  'def.png',
  'default.png',
  'default_logo.png',
  'default_cover.png',
]);

const MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing ${name} in .env`);
    process.exit(1);
  }
  return v;
}

function contentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME[ext] || 'application/octet-stream';
}

async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function fetchRemote(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

function walkFiles(root: string, dir = root): string[] {
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) {
      out.push(...walkFiles(root, full));
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}

async function main() {
  const bucket = requireEnv('CLOUDFLARE_BUCKET_NAME');
  const legacyRoot = process.env.LEGACY_STORAGE_ROOT?.trim();
  if (!legacyRoot || !fs.existsSync(legacyRoot)) {
    console.error('Set LEGACY_STORAGE_ROOT to Laravel storage/app/public (directory must exist).');
    console.error('Example:');
    console.error(
      '  LEGACY_STORAGE_ROOT="../Gizra_full_backup_2026-08-19/deliverymain/storage/app/public" npm run db:migrate-media-to-r2 -- --apply'
    );
    process.exit(1);
  }

  const legacyRootAbs = path.resolve(legacyRoot);
  const publicBase = (process.env.LEGACY_PUBLIC_BASE_URL || '').replace(/\/$/, '');

  const allFiles = walkFiles(legacyRootAbs);
  let skipped = 0;
  let already = 0;
  let uploaded = 0;
  let missing = 0;
  let failed = 0;

  console.log(`Mode: ${apply ? 'APPLY' : 'dry run'}`);
  console.log(`Legacy root: ${legacyRootAbs}`);
  console.log(`R2 bucket: ${bucket}`);
  console.log(`Files on disk: ${allFiles.length}`);

  for (const filePath of allFiles) {
    const base = path.basename(filePath);
    if (SKIP_BASENAMES.has(base)) {
      skipped += 1;
      continue;
    }

    const key = path.relative(legacyRootAbs, filePath).split(path.sep).join('/');
    if (!key || key.startsWith('.')) {
      skipped += 1;
      continue;
    }

    if (await objectExists(bucket, key)) {
      already += 1;
      continue;
    }

    let body: Buffer = fs.readFileSync(filePath);
    if (body.length === 0) {
      skipped += 1;
      continue;
    }

    if (!apply) {
      missing += 1;
      if (missing <= 15) console.log(`  would upload: ${key} (${body.length} bytes)`);
      continue;
    }

    if (publicBase) {
      const remote = await fetchRemote(`${publicBase}/${key}`);
      if (remote) body = Buffer.from(remote);
    }

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType(filePath),
        })
      );
      uploaded += 1;
      if (uploaded % 50 === 0) console.log(`  uploaded ${uploaded}…`);
    } catch (e) {
      failed += 1;
      console.error(`  FAIL ${key}:`, (e as Error).message);
    }
  }

  console.log('');
  console.log(`Skipped (placeholders/empty): ${skipped}`);
  console.log(`Already on R2: ${already}`);
  if (!apply) {
    console.log(`Would upload: ${missing} (re-run with --apply)`);
  } else {
    console.log(`Uploaded: ${uploaded}`);
    console.log(`Failed: ${failed}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
