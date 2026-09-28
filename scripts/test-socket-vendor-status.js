#!/usr/bin/env node
/** @deprecated use scripts/socket/vendor-order-status.js */
const { spawnSync } = require('child_process');
const path = require('path');
const args = process.argv.slice(2);
let orderId;
let status = 'processing';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--order' && args[i + 1]) orderId = args[++i];
  if (args[i] === '--status' && args[i + 1]) status = args[++i];
}
if (!orderId) {
  console.error('Usage: node scripts/socket/vendor-order-status.js <orderId> [status]');
  process.exit(1);
}
const r = spawnSync(process.execPath, [path.join(__dirname, 'socket/vendor-order-status.js'), orderId, status], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(r.status ?? 1);
