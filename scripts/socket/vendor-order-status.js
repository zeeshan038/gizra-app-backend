#!/usr/bin/env node
/**
 * Triggers order_status_changed on listeners (PUT vendor order status).
 *
 * node scripts/socket/vendor-order-status.js <orderId> [status]
 *
 * Env: GIZRA_TOKEN or GIZRA_VENDOR_TOKEN, GIZRA_API_URL
 * status default: processing
 */
const { apiBase, token } = require('./config');

async function main() {
  const orderId = process.argv[2];
  const status = process.argv[3] || 'processing';
  const jwt = process.env.GIZRA_VENDOR_TOKEN || token();

  if (!jwt) {
    console.error('Set GIZRA_TOKEN (vendor JWT)');
    process.exit(1);
  }
  if (!orderId) {
    console.error('Usage: node scripts/socket/vendor-order-status.js <orderId> [status]');
    console.error('Status examples: accepted, processing, handover, delivered, canceled');
    process.exit(1);
  }

  const res = await fetch(`${apiBase()}/api/vendor/orders/${orderId}/status`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  console.log('HTTP', res.status);
  console.log(typeof json === 'string' ? json : JSON.stringify(json, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
