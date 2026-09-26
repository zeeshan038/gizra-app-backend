/**
 * One-time: enable PostGIS on the database in DATABASE_URL.
 * Requires postgis/postgis Postgres image (plain postgres:16 has no PostGIS binaries).
 *
 * Usage: npx ts-node scripts/enablePostgis.ts
 */
import dotenv from 'dotenv';
import prisma from '../src/config/database';

dotenv.config();

async function main() {
  await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis;');
  const rows = await prisma.$queryRaw<{ v: string }[]>`SELECT PostGIS_Version() AS v`;
  console.log('PostGIS enabled:', rows[0]?.v);
}

main()
  .catch((e) => {
    console.error(e.message || e);
    console.error(
      '\nIf you see "extension postgis is not available", switch Docker image to postgis/postgis:16-3.4 and restart postgres.'
    );
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
