#!/usr/bin/env node
/**
 * node scripts/socket/listen.js
 *
 * Env:
 *   GIZRA_TOKEN     JWT (vendor or consumer)
 *   GIZRA_API_URL   default http://127.0.0.1:3002
 *   GIZRA_ORDER_ID  optional — auto watch_order
 */
const { io } = require('socket.io-client');
const EVENTS = require('./events');
const { apiBase, token } = require('./config');

const ORDER_ID = process.env.GIZRA_ORDER_ID || process.env.ORDER_ID;

if (!token()) {
  console.error('Set GIZRA_TOKEN first. Get one with:');
  console.error('  node scripts/socket/vendor-token.js email password');
  process.exit(1);
}

const url = apiBase();
console.log('API:', url);
console.log('Listening for:', EVENTS.SESSION_READY, EVENTS.NEW_ORDER, EVENTS.ORDER_STATUS_CHANGED);
console.log('Ctrl+C to quit\n');

const socket = io(url, {
  path: '/socket.io',
  auth: { token: token() },
  transports: ['websocket', 'polling'],
});

socket.on('connect', () => {
  console.log('[io] connected', socket.id);
  if (ORDER_ID) {
    socket.emit(EVENTS.WATCH_ORDER, { order_id: ORDER_ID }, (ack) => {
      console.log('[watch_order]', ack);
    });
  }
});

socket.on(EVENTS.SESSION_READY, (p) => console.log('[session_ready]', p));
socket.on(EVENTS.NEW_ORDER, (p) => console.log('[new_order]', p));
socket.on(EVENTS.ORDER_STATUS_CHANGED, (p) => console.log('[order_status_changed]', p));
socket.on('connect_error', (e) => console.error('[connect_error]', e.message));

process.on('SIGINT', () => {
  if (ORDER_ID) socket.emit(EVENTS.UNWATCH_ORDER, { order_id: ORDER_ID });
  socket.close();
  process.exit(0);
});
