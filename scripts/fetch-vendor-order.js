#!/usr/bin/env node
/**
 * GET /api/vendor/orders/:id — pricing smoke test.
 *
 * Usage:
 *   node scripts/fetch-vendor-order.js 100602
 *   GIZRA_API_URL=https://backend-prod.gizra.app GIZRA_TOKEN=... node scripts/fetch-vendor-order.js 100602
 */
const { apiBase, token } = require('./socket/config');

const orderId = process.argv[2] || '100602';

async function main() {
  const t = token();
  if (!t) {
    console.error('Set GIZRA_TOKEN (e.g. node scripts/socket/vendor-token.js <email> <password>)');
    process.exit(1);
  }

  const url = `${apiBase()}/api/vendor/orders/${orderId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${t}` },
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`HTTP ${res.status}`, JSON.stringify(json, null, 2));
    process.exit(1);
  }

  const d = json.data;
  const p = d.pricing || {};
  console.log(`GET ${url}\n`);
  console.log('--- pricing (key fields) ---');
  console.log(
    JSON.stringify(
      {
        items_price: p.items_price,
        addon_cost: p.addon_cost,
        subtotal: p.subtotal,
        order_value: p.order_value,
        customer_pays_food: p.customer_pays_food,
        customer_tax_amount: p.customer_tax_amount,
        customer_tax_percent: p.customer_tax_percent,
        delivery_rider_amount: p.delivery_rider_amount,
        delivery_charge: p.delivery_charge,
        gizra_commission_amount: p.gizra_commission_amount,
        gizra_pays_you: p.gizra_pays_you,
        customer_order_total: p.customer_order_total,
        customer_paid_food_delivery: p.customer_paid_food_delivery,
        restaurant_list_total: p.restaurant_list_total,
      },
      null,
      2
    )
  );
  console.log('\n--- top-level ---');
  console.log(
    JSON.stringify(
      {
        order_value: d.order_value,
        order_amount: d.order_amount,
        gizra_pays_you: d.gizra_pays_you,
        restaurant_list_total: d.restaurant_list_total,
        line_subtotal: d.items?.[0]?.line_subtotal,
        unit_food_price: d.items?.[0]?.unit_food_price,
      },
      null,
      2
    )
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
