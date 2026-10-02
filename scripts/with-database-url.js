const { spawn } = require('child_process');
const { buildDatabaseUrl } = require('./build-database-url');

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = buildDatabaseUrl();
}

const child = spawn(
  'npx',
  ['ts-node-dev', '--respawn', '--transpile-only', 'src/index.ts'],
  { stdio: 'inherit', env: process.env, shell: true }
);

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
