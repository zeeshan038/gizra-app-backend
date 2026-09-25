const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres:mysecretpassword@167.233.245.44:5434/gizra_db?schema=public'
});

async function fixDb() {
  try {
    await client.connect();
    console.log('Connected to gizra_db!');
    await client.query('GRANT ALL ON SCHEMA public TO postgres;');
    console.log('Successfully granted privileges on public schema.');
  } catch (error) {
    if (error.code === '3D000') {
      console.log('Database gizra_db does not exist. Creating it...');
      const adminClient = new Client({
        connectionString: 'postgresql://postgres:mysecretpassword@167.233.245.44:5434/postgres?schema=public'
      });
      await adminClient.connect();
      await adminClient.query('CREATE DATABASE gizra_db;');
      console.log('Created gizra_db!');
      await adminClient.end();
      
      // Connect to the new DB to grant permissions
      await client.connect();
      await client.query('GRANT ALL ON SCHEMA public TO postgres;');
      console.log('Granted permissions to newly created gizra_db.');
    } else {
      console.error('Failed with error:', error);
    }
  } finally {
    try { await client.end(); } catch (e) {}
  }
}

fixDb();
