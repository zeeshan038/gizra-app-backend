import '../loadEnv';
import { PrismaClient } from '@prisma/client';
import { isTransientDbError } from '../utils/safeApiError';

const base = new PrismaClient();

async function resetPool(): Promise<void> {
  try {
    await base.$disconnect();
  } catch {
    /* ignore a dead socket */
  }
  await base.$connect();
}

async function withTransientRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (!isTransientDbError(error)) throw error;
    console.warn('[prisma] transient DB error (P1000/P1010) — reset pool and retry once');
    await resetPool();
    return run();
  }
}

const prisma = base.$extends({
  query: {
    async $allOperations({ args, query }) {
      return withTransientRetry(() => query(args));
    },
  },
}) as unknown as PrismaClient;

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
  return 'Verify DATABASE_URL user/password matches Postgres (P1000 = wrong password, P1010 = role denied on gizra_db.public). On server: npm run deploy:server (syncs password + GRANT on public).';
}

export async function prismaPing(): Promise<void> {
  await withTransientRetry(() => base.$queryRaw`SELECT 1`);
}

//Test Connection
export const connectDB = async (): Promise<void> => {
  try {
    await base.$connect();
    await prismaPing();
    try {
      await base.$executeRawUnsafe('CREATE EXTENSION IF NOT EXISTS postgis;');
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
