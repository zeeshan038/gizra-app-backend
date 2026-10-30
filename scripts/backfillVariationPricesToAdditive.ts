/**
 * Convert legacy absolute variation option prices to additive up-charges.
 *
 *   npx ts-node scripts/backfillVariationPricesToAdditive.ts           # dry run
 *   npx ts-node scripts/backfillVariationPricesToAdditive.ts --apply  # write DB
 */
import prisma from '../src/config/database';
import {
  normalizeItemVariationsToAdditive,
  roundCatalogMoney,
} from '../src/utils/vendor/variationCatalogNormalize';

const apply = process.argv.includes('--apply');

async function main() {
  const rows = await prisma.food.findMany({
    select: { id: true, name: true, price: true, variations: true },
  });

  let scanned = 0;
  let changed = 0;

  for (const row of rows) {
    scanned++;
    let parsed: unknown[] = [];
    try {
      parsed = JSON.parse(row.variations || '[]');
      if (!Array.isArray(parsed) || !parsed.length) continue;
    } catch {
      continue;
    }

    const { basePrice, variations } = normalizeItemVariationsToAdditive(
      Number(row.price),
      parsed
    );

    const nextJson = JSON.stringify(variations);
    const priceChanged = Math.abs(roundCatalogMoney(Number(row.price)) - basePrice) > 0.001;
    const jsonChanged = nextJson !== row.variations;

    if (!priceChanged && !jsonChanged) continue;

    changed++;
    console.log(
      `[${apply ? 'apply' : 'dry'}] food #${row.id} ${row.name}: price ${row.price} → ${basePrice}`
    );

    if (apply) {
      await prisma.food.update({
        where: { id: row.id },
        data: {
          price: basePrice,
          variations: nextJson,
        },
      });
    }
  }

  console.log(`\nScanned ${scanned} items with variations; ${changed} would update.`);
  if (!apply && changed > 0) {
    console.log('Re-run with --apply to persist changes.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
