/**
 * Copy data from legacy PHP MySQL (gizra_db) into Postgres (Prisma schema).
 *
 * Prerequisites:
 *   - Postgres reachable via DATABASE_URL (Mac: mac-db-tunnel.sh + 127.0.0.1:5434)
 *   - MySQL reachable via MYSQL_MIGRATION_URL (Mac: mac-mysql-tunnel.sh or mysql-docker-import.sh)
 *
 * Usage:
 *   npm run db:migrate-from-mysql              # compare row counts (dry run)
 *   npm run db:migrate-from-mysql -- --apply   # load data (requires --truncate + confirm for prod)
 *   npm run db:migrate-from-mysql -- --apply --truncate --confirm
 *
 * After apply:
 *   npm run db:migrate-reset-sequences
 *   npx ts-node scripts/backfillCloudflareIds.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import mysql, { RowDataPacket } from 'mysql2/promise';
import { Client } from 'pg';
import { ringToPgPolygonLiteral, type LngLatPair } from '../src/utils/zone/geometry';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BATCH = 400;
const PG_SKIP_TABLES = new Set([
  'spatial_ref_sys',
  'geometry_columns',
  'geography_columns',
  '_prisma_migrations',
]);

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const truncate = args.has('--truncate');
const confirm = args.has('--confirm');

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    console.error(`Missing ${name} in .env`);
    process.exit(1);
  }
  return v;
}

function wktPolygonToPgLiteral(wkt: string): string {
  const m = wkt.match(/^POLYGON\s*\(\((.+)\)\)$/i);
  if (!m) {
    throw new Error(`Unsupported WKT polygon: ${wkt.slice(0, 80)}`);
  }
  const ring: LngLatPair[] = m[1].split(',').map((pair) => {
    const [a, b] = pair.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(a) || !Number.isFinite(b)) {
      throw new Error(`Bad polygon point: ${pair}`);
    }
    return [a, b] as LngLatPair;
  });
  return ringToPgPolygonLiteral(ring);
}

async function pgPublicTables(client: Client): Promise<string[]> {
  const res = await client.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`
  );
  return res.rows.map((r: { tablename: string }) => r.tablename).filter((t: string) => !PG_SKIP_TABLES.has(t));
}

async function pgColumns(client: Client, table: string): Promise<string[]> {
  const res = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  return res.rows.map((r: { column_name: string }) => r.column_name);
}

async function mysqlColumns(conn: mysql.Connection, table: string): Promise<string[]> {
  const [rows] = await conn.query<RowDataPacket[]>(`SHOW COLUMNS FROM \`${table}\``);
  return rows.map((r) => String(r.Field));
}

async function mysqlCount(conn: mysql.Connection, table: string): Promise<number> {
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS c FROM \`${table}\``);
  return Number(rows[0]?.c ?? 0);
}

async function pgCount(client: Client, table: string): Promise<number> {
  const quoted = `"${table.replace(/"/g, '""')}"`;
  const res = await client.query<{ c: string }>(`SELECT COUNT(*)::text AS c FROM ${quoted}`);
  return Number(res.rows[0]?.c ?? 0);
}

function serializeCell(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value)) return value.toString('utf8');
  return value;
}

async function copyTable(
  mysqlConn: mysql.Connection,
  pgClient: Client,
  table: string,
  commonCols: string[]
): Promise<number> {
  if (commonCols.length === 0) return 0;

  const selectCols =
    table === 'zones'
      ? commonCols.map((c) =>
          c === 'coordinates' ? 'ST_AsText(`coordinates`) AS `coordinates`' : `\`${c}\``
        )
      : commonCols.map((c) => `\`${c}\``);

  const [rows] = await mysqlConn.query<RowDataPacket[]>(
    `SELECT ${selectCols.join(', ')} FROM \`${table}\``
  );
  if (rows.length === 0) return 0;

  const pgCols = commonCols.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ');
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const values: unknown[] = [];
    const tuples: string[] = [];

    chunk.forEach((row, ri) => {
      const placeholders: string[] = [];
      commonCols.forEach((col, ci) => {
        const idx = ri * commonCols.length + ci + 1;
        placeholders.push(`$${idx}`);
        let v = row[col];
        if (table === 'zones' && col === 'coordinates' && typeof v === 'string') {
          v = wktPolygonToPgLiteral(v);
        }
        values.push(serializeCell(v));
      });
      tuples.push(`(${placeholders.join(', ')})`);
    });

    const quotedTable = `"${table.replace(/"/g, '""')}"`;
    await pgClient.query(
      `INSERT INTO ${quotedTable} (${pgCols}) VALUES ${tuples.join(', ')}`,
      values
    );
    inserted += chunk.length;
  }

  return inserted;
}

async function truncatePublicData(pgClient: Client, tables: string[]): Promise<void> {
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.replace(/"/g, '""')}"`).join(', ');
  await pgClient.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function main(): Promise<void> {
  const pgUrl = requireEnv('DATABASE_URL');
  const mysqlUrl = requireEnv('MYSQL_MIGRATION_URL');

  if (apply && truncate && !confirm) {
    console.error(
      'Refusing to truncate/load without --confirm (safety). Example:\n' +
        '  npm run db:migrate-from-mysql -- --apply --truncate --confirm'
    );
    process.exit(1);
  }

  const mysqlConn = await mysql.createConnection(mysqlUrl);
  const pgClient = new Client({ connectionString: pgUrl });
  await pgClient.connect();

  try {
    const [mysqlTablesRaw] = await mysqlConn.query<RowDataPacket[]>('SHOW TABLES');
    const mysqlKey = Object.keys(mysqlTablesRaw[0] ?? { Tables_in_gizra_db: '' })[0] ?? 'Tables_in_gizra_db';
    const mysqlTables = mysqlTablesRaw.map((r) => String(r[mysqlKey]));
    const pgTables = new Set(await pgPublicTables(pgClient));
    const shared = mysqlTables.filter((t) => pgTables.has(t)).sort();

    console.log(`MySQL tables: ${mysqlTables.length}, Postgres public: ${pgTables.size}, shared: ${shared.length}`);
    console.log(apply ? 'Mode: APPLY' : 'Mode: dry run (counts only)');

    const diffs: { table: string; mysql: number; pg: number }[] = [];
    for (const table of shared) {
      const mc = await mysqlCount(mysqlConn, table);
      const pc = await pgCount(pgClient, table);
      if (mc !== pc) diffs.push({ table, mysql: mc, pg: pc });
      if (mc > 0 || pc > 0) {
        console.log(`  ${table}: mysql=${mc} pg=${pc}${mc !== pc ? '  <-- diff' : ''}`);
      }
    }

    if (!apply) {
      console.log(`\n${diffs.length} table(s) with count mismatch. Re-run with --apply --truncate --confirm to load from MySQL.`);
      return;
    }

    if (truncate) {
      console.log('\nTruncating Postgres public tables (except PostGIS catalog)…');
      await pgClient.query('SET session_replication_role = replica');
      await truncatePublicData(pgClient, [...pgTables].filter((t) => !PG_SKIP_TABLES.has(t)));
    } else {
      await pgClient.query('SET session_replication_role = replica');
    }

    console.log('\nCopying rows…');
    let total = 0;
    for (const table of shared) {
      const mc = await mysqlCount(mysqlConn, table);
      if (mc === 0) continue;

      const mCols = await mysqlColumns(mysqlConn, table);
      const pCols = await pgColumns(pgClient, table);
      const pSet = new Set(pCols);
      const common = mCols.filter((c) => pSet.has(c));
      const skipped = pCols.filter((c) => !mCols.includes(c));

      try {
        const n = await copyTable(mysqlConn, pgClient, table, common);
        total += n;
        console.log(`  ${table}: inserted ${n}${skipped.length ? ` (pg-only: ${skipped.join(', ')})` : ''}`);
      } catch (e) {
        console.error(`  FAIL ${table}:`, (e as Error).message);
        throw e;
      }
    }

    await pgClient.query('SET session_replication_role = origin');
    console.log(`\nDone. Inserted ${total} rows total.`);
    console.log('Next: npm run db:migrate-reset-sequences');
    console.log('Then: npx ts-node scripts/backfillCloudflareIds.ts');
  } finally {
    await pgClient.end();
    await mysqlConn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
