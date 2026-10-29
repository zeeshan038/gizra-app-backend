/**
 * Generate AI category images for all (or filtered) categories in the database.
 *
 * Usage:
 *   npx ts-node scripts/backfillCategoryImages.ts
 *   npx ts-node scripts/backfillCategoryImages.ts --apply
 *   npx ts-node scripts/backfillCategoryImages.ts --apply --restaurant-id=12
 *   npx ts-node scripts/backfillCategoryImages.ts --apply --all
 *   npx ts-node scripts/backfillCategoryImages.ts --apply --delay-ms=3000
 *
 * Requires DATABASE_URL and R2/Cloudflare env (same as backend). GEMINI_API_KEY optional (falls back to Pollinations).
 */
import dotenv from 'dotenv';
import path from 'path';
import { Prisma } from '@prisma/client';
import prisma from '../src/config/database';
import {
  generateCategoryImageForName,
  isStoredCategoryImagePlaceholder,
} from '../src/utils/vendor/categoryImageGeneration';
import { fitDbString, normalizeStoredMedia } from '../src/utils/mediaStorage';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const apply = process.argv.includes('--apply');
const regenerateAll = process.argv.includes('--all');

function argValue(prefix: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return hit ? hit.slice(prefix.length + 1) : undefined;
}

const restaurantIdArg = argValue('--restaurant-id');
const restaurantIdFilter =
  restaurantIdArg != null && restaurantIdArg !== '' ? Number(restaurantIdArg) : null;

const delayMs = Math.max(0, Number(argValue('--delay-ms') || '2500') || 2500);

function storedCategoryImage(incoming: string): string {
  return fitDbString(normalizeStoredMedia(incoming, 'def.png'), 191) || 'def.png';
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  if (restaurantIdFilter != null && !Number.isFinite(restaurantIdFilter)) {
    throw new Error(`Invalid --restaurant-id=${restaurantIdArg}`);
  }

  const where: Prisma.categoriesWhereInput = { status: true };

  if (restaurantIdFilter != null) {
    where.OR = [
      { restaurant_id: restaurantIdFilter },
      { restaurant_id: null },
      { restaurant_id: 0 },
    ];
  }

  const rows = await prisma.categories.findMany({
    where,
    orderBy: [{ restaurant_id: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      name: true,
      image: true,
      restaurant_id: true,
    },
  });

  const targets = rows.filter((row) => {
    if (!row.name?.trim()) return false;
    if (regenerateAll) return true;
    return isStoredCategoryImagePlaceholder(row.image);
  });

  console.log(
    `Categories in scope: ${rows.length}. To process: ${targets.length} (${regenerateAll ? 'all active' : 'missing/placeholder only'}). Mode: ${apply ? 'APPLY' : 'dry-run'}.`
  );
  if (restaurantIdFilter != null) {
    console.log(`Filter: restaurant_id=${restaurantIdFilter} (includes shared rows with null/0 owner).`);
  }
  console.log(`Delay between generations: ${delayMs}ms`);

  if (!targets.length) {
    console.log('Nothing to do.');
    return;
  }

  if (!apply) {
    for (const row of targets.slice(0, 20)) {
      console.log(
        `  would generate: id=${row.id} restaurant_id=${row.restaurant_id ?? '—'} name="${row.name}" image=${row.image}`
      );
    }
    if (targets.length > 20) {
      console.log(`  … and ${targets.length - 20} more`);
    }
    console.log('\nRe-run with --apply to write images to the database.');
    return;
  }

  let ok = 0;
  let failed = 0;

  for (let i = 0; i < targets.length; i++) {
    const row = targets[i];
    const label = `[${i + 1}/${targets.length}] id=${row.id} "${row.name}" (restaurant ${row.restaurant_id ?? 'shared'})`;

    try {
      const generated = await generateCategoryImageForName(row.name);
      if (!generated?.image) {
        console.warn(`${label} — generation returned no URL`);
        failed += 1;
      } else {
        const stored = storedCategoryImage(generated.image);
        await prisma.categories.update({
          where: { id: row.id },
          data: { image: stored },
        });
        console.log(`${label} — saved (${generated.source}) → ${stored}`);
        ok += 1;
      }
    } catch (e) {
      console.warn(`${label} — error:`, (e as Error).message);
      failed += 1;
    }

    if (i < targets.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  console.log(`\nDone. Updated: ${ok}, failed: ${failed}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
