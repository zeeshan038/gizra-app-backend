import dotenv from 'dotenv';
import path from 'path';
import prisma from '../src/config/database';
import { syncFoodReviewDenormalized } from '../src/utils/consumer/reviewHelpers';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

function arg(name: string): number | null {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return null;
  const n = Number(hit.slice(name.length + 3));
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const oneId = arg('food_id');
  const ids =
    oneId != null
      ? [oneId]
      : (
          await prisma.reviews.findMany({
            distinct: ['food_id'],
            select: { food_id: true },
          })
        ).map((r) => Number(r.food_id));

  for (const foodId of ids) {
    if (!foodId) continue;
    await syncFoodReviewDenormalized(foodId);
    console.log('synced food', foodId);
  }
  console.log('done', ids.length, 'food(s)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
