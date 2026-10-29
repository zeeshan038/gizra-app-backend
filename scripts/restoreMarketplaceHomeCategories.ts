/**
 * Restore legacy PHP-style home categories ("What's on your mind"):
 * - Demote vendor menu sections off home (position=1, restaurant_id from foods)
 * - Ensure marketplace tiles: חלבי, בשרי, סושי, גלידות ומתוקים (position=0, no restaurant)
 *
 * Usage:
 *   npx ts-node scripts/restoreMarketplaceHomeCategories.ts
 *   npx ts-node scripts/restoreMarketplaceHomeCategories.ts --apply
 *   npx ts-node scripts/restoreMarketplaceHomeCategories.ts --apply --generate-images
 */
import dotenv from 'dotenv';
import path from 'path';
import prisma from '../src/config/database';
import {
  generateCategoryImageForName,
  isStoredCategoryImagePlaceholder,
} from '../src/utils/vendor/categoryImageGeneration';
import { fitDbString, normalizeStoredMedia } from '../src/utils/mediaStorage';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const apply = process.argv.includes('--apply');
const generateImages = process.argv.includes('--generate-images');

const MARKETPLACE_HOME: { name: string; priority: number }[] = [
  { name: 'חלבי', priority: 40 },
  { name: 'בשרי', priority: 30 },
  { name: 'סושי', priority: 20 },
  { name: 'גלידות ומתוקים', priority: 10 },
];

const marketplaceNamesLower = new Set(MARKETPLACE_HOME.map((m) => m.name.trim().toLowerCase()));

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05FF]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

function storedImage(incoming: string): string {
  return fitDbString(normalizeStoredMedia(incoming, 'def.png'), 191) || 'def.png';
}

async function inferRestaurantIdFromFoods(categoryId: bigint): Promise<number | null> {
  const rows = await prisma.food.groupBy({
    by: ['restaurant_id'],
    where: { category_id: Number(categoryId), status: true },
    _count: { restaurant_id: true },
    orderBy: { _count: { restaurant_id: 'desc' } },
    take: 1,
  });
  if (!rows.length) return null;
  const id = Number(rows[0].restaurant_id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function main() {
  console.log(`Mode: ${apply ? 'APPLY' : 'dry-run'}`);

  const homeCandidates = await prisma.categories.findMany({
    where: {
      status: true,
      position: BigInt(0),
      OR: [{ restaurant_id: null }, { restaurant_id: 0 }],
    },
    select: { id: true, name: true, restaurant_id: true, image: true },
  });

  const toDemote = homeCandidates.filter(
    (c) => !marketplaceNamesLower.has(c.name.trim().toLowerCase())
  );

  console.log(`Home candidates (position=0, global): ${homeCandidates.length}`);
  console.log(`Will demote off home (not marketplace names): ${toDemote.length}`);

  for (const row of toDemote.slice(0, 15)) {
    const inferred = await inferRestaurantIdFromFoods(row.id);
    console.log(
      `  demote id=${row.id} "${row.name}" → position=1${inferred ? ` restaurant_id=${inferred}` : ''}`
    );
  }
  if (toDemote.length > 15) {
    console.log(`  … and ${toDemote.length - 15} more`);
  }

  for (const tile of MARKETPLACE_HOME) {
    const existing = await prisma.categories.findFirst({
      where: { name: { equals: tile.name, mode: 'insensitive' } },
    });
    if (existing) {
      console.log(
        `Marketplace "${tile.name}": existing id=${existing.id} position=${existing.position} restaurant_id=${existing.restaurant_id ?? 'null'}`
      );
    } else {
      console.log(`Marketplace "${tile.name}": would create (position=0, priority=${tile.priority})`);
    }
  }

  if (!apply) {
    console.log('\nRe-run with --apply to update the database.');
    return;
  }

  for (const row of toDemote) {
    const inferred = await inferRestaurantIdFromFoods(row.id);
    await prisma.categories.update({
      where: { id: row.id },
      data: {
        position: BigInt(1),
        ...(inferred != null ? { restaurant_id: inferred } : {}),
      },
    });
  }

  for (const tile of MARKETPLACE_HOME) {
    let image = 'def.png';
    if (generateImages) {
      const generated = await generateCategoryImageForName(tile.name);
      if (generated?.image) {
        image = storedImage(generated.image);
      }
    }

    const existing = await prisma.categories.findFirst({
      where: { name: { equals: tile.name, mode: 'insensitive' } },
    });

    if (existing) {
      const data: Record<string, unknown> = {
        position: BigInt(0),
        restaurant_id: null,
        priority: BigInt(tile.priority),
        status: true,
        parent_id: BigInt(0),
      };
      if (generateImages && isStoredCategoryImagePlaceholder(String(existing.image))) {
        data.image = image;
      }
      await prisma.categories.update({
        where: { id: existing.id },
        data,
      });
      console.log(`Updated marketplace category id=${existing.id} "${tile.name}"`);
    } else {
      const created = await prisma.categories.create({
        data: {
          name: tile.name,
          image: generateImages ? image : 'def.png',
          parent_id: BigInt(0),
          position: BigInt(0),
          priority: BigInt(tile.priority),
          status: true,
          restaurant_id: null,
          slug: slugify(tile.name),
        },
      });
      console.log(`Created marketplace category id=${created.id} "${tile.name}"`);
      if (generateImages && isStoredCategoryImagePlaceholder(image)) {
        const generated = await generateCategoryImageForName(tile.name);
        if (generated?.image) {
          await prisma.categories.update({
            where: { id: created.id },
            data: { image: storedImage(generated.image) },
          });
        }
      }
    }
  }

  console.log('\nDone. Verify: GET /api/consumer/categories?zone_id=8');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
