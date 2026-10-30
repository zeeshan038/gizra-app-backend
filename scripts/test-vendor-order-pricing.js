/**
 * Vendor order detail pricing — order #100602 (food+addons = 27, Gizra 10%, + delivery).
 */
const {
  buildOrderPricing,
  mapOrderDetailLineItem,
  unitFoodPriceFromDetail,
} = require('../dist/utils/vendor/order/detailMapper');

let failed = 0;

function assert(name, ok, detail) {
  console.log(ok ? `  ✓ ${name}` : `  ✗ ${name} — ${detail}`);
  if (!ok) failed = 1;
}

const partyVariations =
  '[{"type":"Sizes","values":[{"label":"Party","optionPrice":4}]}]';

console.log('unitFoodPriceFromDetail (stored 19, catalog 19, Party +4, addons 4)\n');
const unitFood100602 = unitFoodPriceFromDetail(
  {
    price: 19,
    food_details: JSON.stringify({ price: 19, name: 'Pizza' }),
    variation: '[{"type":"Sizes","value":"Party"},{"type":"Extras","value":"Mashroom"}]',
    add_ons: '[{"name":"Double Cheese","price":2,"quantity":1}]',
  },
  4,
  { variations: partyVariations }
);
assert(
  'order 100602 unit food stays 19 (variation fixed at order level via VAT)',
  unitFood100602 === 19,
  `got ${unitFood100602}`
);

console.log('\nunitFoodPriceFromDetail (stored 19, live menu Party +20 — must not use today menu)\n');
const unitFoodStaleMenu = unitFoodPriceFromDetail(
  {
    price: 19,
    food_details: JSON.stringify({ price: 19, name: 'Pizza' }),
    variation: '[{"type":"Sizes","value":"Party"}]',
    add_ons: '[]',
  },
  0,
  { variations: '[{"type":"Sizes","values":[{"label":"Party","optionPrice":20}]}]' }
);
assert('stored 19 ignores stale +20 menu variation', unitFoodStaleMenu === 19, `got ${unitFoodStaleMenu}`);

console.log('\nunitFoodPriceFromDetail (stored 23, catalog 19, addons 4)\n');
const unitFood = unitFoodPriceFromDetail(
  {
    price: 23,
    food_details: JSON.stringify({ price: 19, name: 'Pizza' }),
    add_ons: '[{"name":"Double Cheese","price":2,"quantity":1}]',
  },
  4
);
assert('stored 23 unit food is 23', unitFood === 23, `got ${unitFood}`);

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

const items = [
  {
    line_food_total: 19,
    line_addon_total: 4,
    quantity: 1,
    unit_food_price: 19,
    line_subtotal: 23,
  },
];
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

console.log('\nplace-order snapshot on food_details (order 100603+)\n');
const snapItem = mapOrderDetailLineItem({
  id: BigInt(1),
  price: 23,
  quantity: BigInt(1),
  food_details: JSON.stringify({
    price: 19,
    unit_food_price: 23,
    name: 'Pizza',
  }),
  add_ons: '[{"name":"A","price":2,"quantity":1},{"name":"B","price":2,"quantity":1}]',
  variation: '[]',
  food_id: 1415,
});
assert('snapshot unit_food_price → line food 23', snapItem.unit_food_price === 23, `got ${snapItem.unit_food_price}`);
assert('snapshot → pricing items_price 23 without tax hack', snapItem.line_food_total === 23, `got ${snapItem.line_food_total}`);

console.log(failed ? '\nFAILED' : '\nPASSED');
process.exit(failed);
