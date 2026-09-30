/**
 * Assign cloudflareId + R2 folder placeholders for existing admins, vendors, delivery_men.
 * Usage: npx ts-node scripts/backfillCloudflareIds.ts
 */
import dotenv from 'dotenv';
import prisma from '../src/config/database';
import { provisionAccountStorage } from '../src/utils/accountStorage';

dotenv.config();

async function backfillTable(
  label: string,
  role: 'admin' | 'vendor' | 'deliveryman',
  fetchRows: () => Promise<{ id: bigint; cloudflareId: string | null }[]>
) {
  const rows = await fetchRows();
  let updated = 0;
  for (const row of rows) {
    if (row.cloudflareId) continue;
    const cloudflareId = await provisionAccountStorage(role);
    if (role === 'admin') {
      await prisma.admins.update({ where: { id: row.id }, data: { cloudflareId } });
    } else if (role === 'vendor') {
      await prisma.vendors.update({ where: { id: row.id }, data: { cloudflareId } });
    } else {
      await prisma.delivery_men.update({ where: { id: row.id }, data: { cloudflareId } });
    }
    updated += 1;
    console.log(`  ${label} id=${row.id} -> ${cloudflareId}`);
  }
  return updated;
}

async function main() {
  console.log('Backfilling cloudflareId...');
  const a = await backfillTable('admin', 'admin', () =>
    prisma.admins.findMany({ select: { id: true, cloudflareId: true } })
  );
  const v = await backfillTable('vendor', 'vendor', () =>
    prisma.vendors.findMany({ select: { id: true, cloudflareId: true } })
  );
  const d = await backfillTable('delivery_man', 'deliveryman', () =>
    prisma.delivery_men.findMany({ select: { id: true, cloudflareId: true } })
  );
  console.log(`Done. Updated admins=${a}, vendors=${v}, delivery_men=${d}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
