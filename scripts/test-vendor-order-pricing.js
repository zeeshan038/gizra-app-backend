/**
 * Vendor order detail pricing — order #100602 (food+addons = 27, Gizra 10%, + delivery).
 */
const {
  buildOrderPricing,
  unitFoodPriceFromDetail,
} = require('../dist/utils/vendor/order/detailMapper');

let failed = 0;

function assert(name, ok, detail) {
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name} — ${detail}`);
  if (!ok) failed = 1;
}

console.log('unitFoodPriceFromDetail (stored 23, catalog 19, addons 4)\n');
const unitFood = unitFoodPriceFromDetail(
  {
    price: 23,
    food_details: JSON.stringify({ price: 19, name: 'Pizza' }),
    add_ons: '[{"name":"Double Cheese","price":2,"quantity":1}]',
  },
  4
);
assert('unit food is 23 (not 19)', unitFood === 23, `got ${unitFood}`);

const order = {
  order_amount: 27,
  total_tax_amount: 1.35,
  delivery_charge: 8.87,
  dm_tips: 0,
  additional_charge: 0,
  extra_packaging_amount: 0,
  restaurant_discount_amount: 0,
  coupon_discount_amount: 0,
  ref_bonus_amount: 0,
  tax_status: 'excluded',
  tax_percentage: 5,
};

const items = [{ line_food_total: 23, line_addon_total: 4 }];
const pricing = buildOrderPricing(order, items);

console.log('\nVendor detail pricing (100602 scenario)\n');
console.log(JSON.stringify(pricing, null, 2));
console.log('');

assert('items_price 23', pricing.items_price === 23, `got ${pricing.items_price}`);
assert('addon_cost 4', pricing.addon_cost === 4, `got ${pricing.addon_cost}`);
assert('subtotal / order_value 27', pricing.order_value === 27, `got ${pricing.order_value}`);
assert('Gizra 10% on food only 2.7', pricing.gizra_commission_amount === 2.7, `got ${pricing.gizra_commission_amount}`);
assert('gizra_pays_you 24.3', pricing.gizra_pays_you === 24.3, `got ${pricing.gizra_pays_you}`);
assert('rider gets full delivery 8.87', pricing.delivery_rider_amount === 8.87, `got ${pricing.delivery_rider_amount}`);
assert('customer food+delivery 35.87', pricing.customer_paid_food_delivery === 35.87, `got ${pricing.customer_paid_food_delivery}`);
assert('customer checkout total uses stored order_amount 27', pricing.customer_order_total === 27, `got ${pricing.customer_order_total}`);
assert('customer_tax separate from gizra fee', pricing.customer_tax_amount === 1.35, `got ${pricing.customer_tax_amount}`);

console.log(failed ? '\nFAILED' : '\nPASSED');
process.exit(failed);
