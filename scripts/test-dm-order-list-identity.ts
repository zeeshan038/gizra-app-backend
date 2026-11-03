/**
 * Asserts manual-dispatch list card includes restaurant POS id for driver latest/active APIs.
 * Run: npx ts-node scripts/test-dm-order-list-identity.ts
 */
import { driverOrderListCardIdentity } from '../src/utils/order/orderIdentity';

function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

const manual = driverOrderListCardIdentity({
  id: BigInt(100501),
  is_manual_dispatch: true,
  order_type: 'delivery',
  restaurant_order_ref: '4521',
});

assert(manual.order_id === '100501', 'order_id should be gizra id');
assert(manual.gizra_order_id === '100501', 'gizra_order_id');
assert(manual.restaurant_order_ref === '4521', 'restaurant_order_ref');
assert(manual.restaurant_order_number === '4521', 'restaurant_order_number alias');
assert(manual.display_order_number === '4521', 'display_order_number prefers POS ref');
assert(manual.dispatch_summary?.restaurant_order_ref === '4521', 'dispatch_summary ref');

const consumer = driverOrderListCardIdentity({
  id: BigInt(99),
  is_manual_dispatch: false,
  order_type: 'delivery',
  restaurant_order_ref: null,
});

assert(consumer.display_order_number === '99', 'consumer uses gizra id');
assert(!('dispatch_summary' in consumer), 'no dispatch_summary for app orders');

console.log('OK — driver latest/active list identity fields');
