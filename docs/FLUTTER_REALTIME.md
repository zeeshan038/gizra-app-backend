# Gizra Realtime (Socket.IO) — Flutter Integration Guide

**Audience:** Flutter (Vendor POS, Consumer, Delivery driver)  
**Backend:** `gizra-backend`  
**Contract source:** `src/types/sockets/realtime.ts`

---

## 1. Overview

| Layer | Role |
|--------|------|
| **REST** | Source of truth: login, lists, detail, every button (Accept, Send to Kitchen, Ready, cancel, etc.) |
| **Socket.IO** | Live updates while screens stay open; sync across tablets and apps |
| **FCM** | Alerts when the app is backgrounded or on another screen |

**Golden rule:** Buttons always call **REST first**. Sockets do not replace GET/PUT. On socket events, update local state or refetch for safety.

---

## 2. Connection settings

| Setting | Value |
|---------|--------|
| **Base URL** | Same host as REST API (e.g. `https://api.gizra.app`) |
| **Socket path** | `/socket.io` (default; server env `SOCKET_PATH` overrides) |
| **Transports** | `websocket`, `polling` (fallback) |
| **Authentication** | JWT in handshake `auth.token` (or query `token` fallback) |

Socket.IO shares the **same port** as Express (e.g. `3000` in container, `3002` on host via Docker map).

---

## 3. Recommended Flutter package

```yaml
dependencies:
  socket_io_client: ^3.0.0   # use latest compatible with your Dart SDK
```

Pub: [socket_io_client](https://pub.dev/packages/socket_io_client)

Backend uses **Socket.IO v4** (`socket.io` ^4.8).

### 3.1 Connect example

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

IO.Socket connectRealtime({
  required String apiBaseUrl,
  required String jwt,
}) {
  return IO.io(
    apiBaseUrl,
    IO.OptionBuilder()
        .setPath('/socket.io')
        .setTransports(['websocket', 'polling'])
        .enableAutoConnect()
        .enableReconnection()
        .setAuth({'token': jwt})
        .build(),
  );
}
```

### 3.2 When to connect / disconnect

| App | Connect | Disconnect |
|-----|---------|------------|
| **Vendor POS** | After `POST /api/vendor/login` success | Logout, invalid session |
| **Consumer** | After `POST /api/consumer/login` success | Logout |
| **Driver** | After `POST /api/delivery-man/login` success | Logout |

**Vendor & driver:** JWT must match `auth_token` in DB (new login on another device invalidates old token → socket gets `Unauthorized`).

---

## 4. Event names (wire contract)

### 4.1 Server → client (listen with `.on`)

| Event name | When it fires |
|------------|----------------|
| `session_ready` | Immediately after valid JWT connect |
| `new_order` | New **marketplace** order (consumer checkout); not in-store POS-only |
| `order_status_changed` | After **`PUT /api/vendor/orders/:id/status`** succeeds |

### 4.2 Client → server (emit)

| Event name | When to emit |
|------------|----------------|
| `watch_order` | User opens order **detail** or **tracking** for a specific order |
| `unwatch_order` | User leaves that screen (route dispose) |


## 5. Payloads

### 5.1 `session_ready` (server → client)

```json
{
  "role": "vendor",
  "restaurant_id": 42
}
```

```json
{
  "role": "customer",
  "user_id": 99
}
```

```json
{
  "role": "delivery_man",
  "delivery_man_id": 7
}
```

| Field | Type | Present when |
|-------|------|----------------|
| `role` | `"vendor"` \| `"customer"` \| `"delivery_man"` | Always |
| `restaurant_id` | `number` | `role === "vendor"` |
| `user_id` | `number` | `role === "customer"` |
| `delivery_man_id` | `number` | `role === "delivery_man"` |

---

### 5.2 `new_order` (server → client)

**Recipients:** Vendor sockets in room `restaurant:{restaurant_id}` (auto-joined on connect).

```json
{
  "order_id": "100178",
  "restaurant_id": 42,
  "order_amount": 210,
  "order_type": "delivery",
  "payment_method": "cash_on_delivery"
}
```

| Field | Type |
|-------|------|
| `order_id` | `string` |
| `restaurant_id` | `number` |
| `order_amount` | `number` |
| `order_type` | `string` |
| `payment_method` | `string` \| `null` |

Use for Active Order banner, sound, list refresh. Load full detail via **`GET /api/vendor/orders/:id`**.

---

### 5.3 `order_status_changed` (server → client)

**When:** Vendor status PUT succeeds.  
**Recipients:** `restaurant:{id}`, `order:{id}`, `user:{user_id}`, `delivery_man:{id}` (if assigned).

```json
{
  "order_id": "100178",
  "restaurant_id": 42,
  "user_id": "99",
  "delivery_man_id": null,
  "order_status": "processing",
  "order_amount": 210,
  "order_type": "delivery",
  "payment_method": "cash_on_delivery",
  "updated_at": "2026-09-28T18:30:00.000Z"
}
```

| Field | Type |
|-------|------|
| `order_id` | `string` |
| `restaurant_id` | `number` |
| `user_id` | `string` \| `null` |
| `delivery_man_id` | `string` \| `null` |
| `order_status` | `string` (DB value; see §8) |
| `order_amount` | `number` |
| `order_type` | `string` |
| `payment_method` | `string` \| `null` |
| `updated_at` | ISO-8601 string |

---

### 5.4 `watch_order` (client → server)

Subscribe to realtime updates for **one order** (joins room `order:{orderId}`).  
Implementation: `src/sockets/handlers.ts` → `canAccessOrder` in `src/sockets/auth.ts`.

**Emit (request body):**

```json
{
  "order_id": "100178"
}
```

| Field | Type | Required |
|-------|------|----------|
| `order_id` | `string` or `number` | Yes |

**You must use `emitWithAck`** (or Socket.IO equivalent with ack callback). The server only sends the responses below when an ack function is provided.

#### Ack responses (exact strings from backend)

| # | Condition | Response JSON | HTTP equivalent |
|---|-----------|---------------|-----------------|
| 1 | Success: valid id + user allowed | `{ "ok": true, "order_id": "100178" }` | — |
| 2 | Missing / zero / non-numeric `order_id` | `{ "ok": false, "msg": "Invalid order_id" }` | 400 |
| 3 | Not allowed (see table below) | `{ "ok": false, "msg": "Forbidden" }` | 403 |

There are **no other** `msg` values for `watch_order` today.

**Success example:**

```json
{
  "ok": true,
  "order_id": "100178"
}
```

Note: `order_id` in the ack is always a **string**, even if you sent a number.

**Failure examples:**

```json
{
  "ok": false,
  "msg": "Invalid order_id"
}
```

```json
{
  "ok": false,
  "msg": "Forbidden"
}
```

#### When you get `Forbidden` (same message for all)

| Situation | Role |
|-----------|------|
| Order id does not exist in DB | Any |
| Order is in-store POS (`order_type === "pos"`) | Any |
| Order belongs to another restaurant | Vendor |
| Order belongs to another customer | Customer |
| Order not assigned to this driver, or assigned to another driver | Driver |

The server does **not** return `"Order not found"` separately — unknown ids use **`Forbidden`**.

#### After success

- Socket is in room `order:{orderId}`.
- Client receives **`order_status_changed`** for that order (in addition to role default rooms).
- Does **not** send order detail; call **`GET /api/vendor/orders/:id`** (or consumer/driver order API) for full data.

**Dart:**

```dart
socket.emitWithAck('watch_order', {'order_id': orderId}, ack: (data) {
  final map = Map<String, dynamic>.from(data as Map);
  if (map['ok'] == true) {
    final id = map['order_id'] as String;
    // subscribed to order:$id
    return;
  }
  final msg = map['msg'] as String? ?? 'unknown';
  switch (msg) {
    case 'Invalid order_id':
      // bad argument — fix UI state
      break;
    case 'Forbidden':
      // wrong user, wrong restaurant, POS order, or unknown id
      break;
  }
});
```

**If ack callback is omitted:** server may still join the room on success, but the client gets **no** ack payload — always pass ack in Flutter.

---

### 5.5 `unwatch_order` (client → server)

Leave room `order:{orderId}`.

**Emit:**

```json
{
  "order_id": "100178"
}
```

| Response | Notes |
|----------|--------|
| **None** | No ack; server never sends success/error JSON |

If `order_id` is invalid (missing, zero, non-numeric), the handler **silently ignores** the event (no error message).

Emit when disposing order detail / tracking route.

---

## 6. Errors

### 6.1 Socket connection

| Symptom | Cause | Action |
|---------|--------|--------|
| `connect_error`: **Unauthorized** | Missing/invalid JWT, expired vendor/driver session | Re-login; pass fresh token |
| No `session_ready` | Connect failed | Fix URL, path, token |
| Events never arrive | Wrong event name or wrong role (e.g. consumer listening for `new_order`) | See §4 |

### 6.2 `watch_order` ack (quick lookup)

| `msg` | Meaning | Flutter action |
|-------|---------|----------------|
| *(ok: true)* | Subscribed to `order:{id}` | Enable live status UI; optional GET detail |
| `Invalid order_id` | Bad/missing `order_id` in emit payload | Do not show tracking; fix navigation args |
| `Forbidden` | No access, POS order, or unknown order id | Show “cannot view order”; pop or read-only from REST only |

### 6.3 REST (standard envelope)

Success:

```json
{
  "status": true,
  "msg": "…",
  "data": { }
}
```

Error:

```json
{
  "status": false,
  "msg": "…"
}
```

HTTP **401** → re-authenticate (same rules as socket).

---

## 7. REST endpoints (use with sockets)

All vendor order routes: **`Authorization: Bearer {jwt}`**

Base prefix: **`/api`**

### 7.1 Vendor login

```
POST /api/vendor/login
Content-Type: application/json

{
  "email": "vendor@example.com",
  "password": "********"
}
```

Success:

```json
{
  "status": true,
  "msg": "Login success",
  "data": {
    "token": "<JWT>",
    "restaurant_id": "42"
  }
}
```

### 7.2 Consumer login (manual)

```
POST /api/consumer/login
```

Body: `login_type: "manual"`, `field_type: "phone"`, `email_or_phone`, `password` (see `src/schemas/consumer/User.ts`).

Success includes `data.token`.

### 7.3 Driver login

```
POST /api/delivery-man/login
```

Success includes token in `data` (same pattern as vendor).

### 7.4 Vendor orders

| Action | Method | Path |
|--------|--------|------|
| List | GET | `/api/vendor/orders?status=all&limit=20&offset=0` |
| Detail | GET | `/api/vendor/orders/:id` |
| Counts | GET | `/api/vendor/orders/counts` |
| **Update status** | PUT | `/api/vendor/orders/:id/status` |

**Status update body:**

```json
{
  "status": "processing",
  "cancellation_reason": ""
}
```

**Allowed `status` values:**

`confirmed`, `accepted`, `processing`, `handover`, `delivered`, `canceled`

**Success (200) — emits `order_status_changed`:**

```json
{
  "status": true,
  "msg": "Order status updated to processing",
  "data": {
    "id": "100178",
    "order_status": "processing",
    "order_amount": 210
  }
}
```

**Common errors (PUT status):**

| HTTP | `msg` (examples) |
|------|------------------|
| 400 | Validation / invalid status |
| 403 | No restaurant context |
| 404 | Order not found |
| 400 | Cannot change status after picked up |

---

## 8. UI stepper ↔ `order_status` (vendor)

| UI step (POS) | DB `order_status` | Typical PUT `status` |
|---------------|-------------------|----------------------|
| New / awaiting acceptance | `pending`, `confirmed` | `accepted` or `confirmed` |
| Accepted | `accepted` | — |
| Preparing / Sent to kitchen | `processing` | `processing` |
| Waiting / Ready for delivery | `handover` | `handover` |
| On the way / Picked | `picked_up` | Driver flow (socket emit **not wired yet**) |
| Delivered | `delivered` | `delivered` |

**List filter query** (`GET /orders?status=...`) uses labels like `cooking` → DB `processing`, `ready_for_delivery` → `handover` (see `src/utils/vendor/order/query.ts`).

---

## 9. Where to call what (by screen)

### Vendor POS

| Screen | REST | Listen | Emit |
|--------|------|--------|------|
| Login | POST `/vendor/login` | — | — |
| Logged-in shell | — | Connect socket | — |
| After connect | — | `session_ready` | — |
| **Active Order** | GET `/vendor/orders` on enter | `new_order`, `order_status_changed` | — |
| **Order detail** | GET `/vendor/orders/:id` | `order_status_changed` | `watch_order` / `unwatch_order` |
| Accept / Kitchen / Ready | **PUT `/vendor/orders/:id/status`** | (other devices get socket) | — |
| Other tabs (settings, driver form) | As needed | Optional: stay connected for `new_order` | — |
| App background | — | FCM | — |

### Consumer

| Screen | REST | Socket |
|--------|------|--------|
| Order tracking | GET order on enter | `watch_order`; `order_status_changed` |
| Not on tracking | — | `unwatch_order`; rely on FCM |

### Driver

| Screen | REST | Socket |
|--------|------|--------|
| Active delivery | GET order | `watch_order`; `order_status_changed` when backend wires driver updates |

---

## 10. Auto-rooms (server-side, no Flutter code)

On connect, server joins:

| Role | Room |
|------|------|
| Vendor | `restaurant:{restaurantId}` |
| Customer | `user:{userId}` |
| Driver | `delivery_man:{deliveryManId}` |

`watch_order` adds `order:{orderId}`.

---

## 11. Flutter service pattern

```dart
class GizraRealtimeService {
  IO.Socket? _socket;

  void start({required String apiUrl, required String jwt}) {
    stop();
    _socket = connectRealtime(apiBaseUrl: apiUrl, jwt: jwt);
    _socket!.on('session_ready', _onSessionReady);
    _socket!.on('new_order', _onNewOrder);
    _socket!.on('order_status_changed', _onOrderStatusChanged);
    _socket!.on('connect_error', (e) => /* re-auth */);
  }

  void watchOrder(String orderId) {
    _socket?.emitWithAck('watch_order', {'order_id': orderId}, ack: (_) {});
  }

  void unwatchOrder(String orderId) {
    _socket?.emit('unwatch_order', {'order_id': orderId});
  }

  void stop() {
    _socket?.dispose();
    _socket = null;
  }
}
```

---

## 12. Backend test scripts (Node)

From `gizra-backend/`:

```bash
npm install
export GIZRA_API_URL=http://127.0.0.1:3002
export GIZRA_TOKEN=$(node scripts/socket/vendor-token.js EMAIL PASSWORD)
node scripts/socket/listen.js

# other terminal:
node scripts/socket/vendor-order-status.js ORDER_ID processing
```

```bash
node scripts/socket/help.js
```

---

## 13. Known gaps (backend roadmap)

1. **Driver** order status updates do **not** emit `order_status_changed` yet.  
2. Kitchen notes / “notify customer” — no socket event yet.  
3. Request GIZRA driver / dispatch — REST only.  
4. Vendor **web** may still use **SSE** for new orders (`GET /vendor/orders/events`); Flutter should use **`new_order`**.  
5. Production must run a backend build that includes `initSocketServer` in `src/index.ts`.

---

## 14. Quick reference

```
CONNECT   auth: { token: JWT }     path: /socket.io
LISTEN    session_ready | new_order | order_status_changed
EMIT      watch_order { order_id } | unwatch_order { order_id }
ACTIONS   REST PUT /api/vendor/orders/:id/status
LOAD UI   REST GET orders / order detail on screen open
BACKGROUND FCM (not socket)
```

**TypeScript types:** `src/types/sockets/realtime.ts`, `src/types/sockets/auth.ts`
