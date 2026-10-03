import '../loadEnv';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function databaseUrlHint(): string {
  const raw = process.env.DATABASE_URL ?? '';
  if (!raw) {
    return 'DATABASE_URL is missing. Set it in .env (Docker: host `postgres`, port 5432, password must match the Postgres volume).';
  }
  try {
    const u = new URL(raw.replace(/^postgresql:/, 'http:'));
    const host = u.hostname;
    if (host === '127.0.0.1' || host === 'localhost') {
      return 'Inside Docker Compose, DATABASE_URL must use host `postgres:5432`, not localhost (localhost is the API container itself).';
    }
    if (host.includes('167.233') || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      return 'Mac local dev: Postgres is usually not open on the server public IP. SSH tunnel to 127.0.0.1:5434 and set DATABASE_URL host to 127.0.0.1 (see .env comments). On the server in Docker use host `postgres:5432`.';
    }
  } catch {
    /* ignore parse errors */
  }
  return 'Verify DATABASE_URL user/password matches Postgres (P1000 = wrong password). On server: docker exec gizra-postgres psql -U postgres -c "ALTER USER postgres WITH PASSWORD \'...\';" then update .env and recreate backend.';
}

//Test Connection
export const connectDB = async (): Promise<void> => {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    try {
      await prisma.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis;');
    } catch (postgisErr) {
      console.warn(
        'PostGIS extension could not be enabled (zone APIs need postgis/postgis image or CREATE EXTENSION postgis):',
        postgisErr
      );
    }
    console.log('Connected to PostgreSQL Database via Prisma');
  } catch (err) {
    console.error('Failed to connect to PostgreSQL Database:', err);
    console.error(databaseUrlHint());
    throw err;
  }
};

export default prisma;
