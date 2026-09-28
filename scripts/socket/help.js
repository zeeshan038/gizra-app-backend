#!/usr/bin/env node
console.log(`
Gizra socket test scripts (run from gizra-backend/)

  Server → client:
    session_ready           after connect
    new_order               new marketplace order
    order_status_changed    vendor updates order status (stepper)

  Client → server:
    watch_order             { order_id }
    unwatch_order           { order_id }

1) Get vendor token:
   export GIZRA_API_URL=http://127.0.0.1:3002
   export GIZRA_TOKEN=$(node scripts/socket/vendor-token.js EMAIL PASSWORD)

2) Listen (terminal A):
   node scripts/socket/listen.js

3) Fire status update (terminal B):
   node scripts/socket/vendor-order-status.js ORDER_ID processing

Consumer token:
   export GIZRA_TOKEN=$(node scripts/socket/consumer-token.js PHONE PASSWORD)
   node scripts/socket/listen.js
`);
