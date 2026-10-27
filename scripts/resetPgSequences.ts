/**
 * Reset serial/identity sequences after bulk MySQL import.
 * Usage: npm run db:migrate-reset-sequences
 */
import dotenv from 'dotenv';
import path from 'path';
import { Client } from 'pg';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error('Missing DATABASE_URL');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  const tables = await client.query<{ table_name: string; column_name: string }>(`
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
      AND c.column_default LIKE 'nextval%'
    ORDER BY c.table_name
  `);

  for (const { table_name, column_name } of tables.rows) {
    const seq = await client.query<{ seq: string | null }>(
      `SELECT pg_get_serial_sequence($1, $2) AS seq`,
      [table_name, column_name]
    );
    const seqName = seq.rows[0]?.seq;
    if (!seqName) continue;

    const qTable = `"${table_name.replace(/"/g, '""')}"`;
    const qCol = `"${column_name.replace(/"/g, '""')}"`;
    await client.query(`
      SELECT setval('${seqName.replace(/'/g, "''")}',
        COALESCE((SELECT MAX(${qCol}) FROM ${qTable}), 1),
        true)
    `);
    console.log(`  ${table_name}.${column_name} → ${seqName}`);
  }

  await client.end();
  console.log('Sequences updated.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
