# Socket.IO & push — Flutter (Consumer, Vendor, Driver)

**Audience:** Flutter developers (consumer app, vendor POS, delivery driver)  
**Backend:** `gizra-backend`  
**Wire contract (TypeScript):** `src/types/sockets/realtime.ts`  
**Implementation:** `src/sockets/` (`handlers.ts`, `publish.ts`, `auth.ts`, `rooms.ts`)

---

## 1. Three layers (use all three)

| Layer | Purpose |
|--------|---------|
| **REST** | Source of truth: login, lists, detail, every button (Accept, status, checkout, etc.) |
| **Socket.IO** | Live updates while the app is open and connected |
| **FCM** | Alerts when the app is backgrounded, killed, or on another screen |

**Golden rule:** User actions always call **REST first**. On socket (or FCM) events, update local state or **refetch** the relevant GET for safety.

---

## 2. Connection (all apps)

| Setting | Value |
|---------|--------|
| **Host** | Same base URL as REST (e.g. `https://api.gizra.app`) |
| **Path** | `/socket.io` (override: env `SOCKET_PATH`) |
| **Transports** | `websocket`, then `polling` fallback |
| **Auth** | JWT in handshake `auth.token` (fallback: query `?token=`) |

Socket.IO runs on the **same HTTP port** as Express.

### 2.1 When to connect

| App | Connect after | Disconnect on |
|-----|----------------|---------------|
| **Vendor POS** | `POST /api/vendor/login` | Logout / invalid session |
| **Consumer** | `POST /api/consumer/login` (or register flow that returns `token`) | Logout |
| **Driver** | `POST /api/delivery-man/login` | Logout |

### 2.2 JWT `role` (must match app)

| App | JWT claim | Socket auth notes |
|-----|-----------|-------------------|
| Vendor | `role` omitted or `vendor` | Token must equal `vendors.auth_token` (new login invalidates old devices) |
| Consumer | `role: "customer"` | User must be active |
| Driver | `role: "delivery_man"` | Approved + active; token must equal `delivery_men.auth_token` |

Failed auth → connection error **`Unauthorized`**.

### 2.3 Flutter package

```yaml
dependencies:
  socket_io_client: ^3.0.0   # match your Dart SDK; backend uses Socket.IO v4
```

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

IO.Socket connectGizraSocket({
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

---

## 3. Event names (complete list)

There are **four** server → client events and **two** client → server events today.

### 3.1 Server → client (`.on`)

| Event | Constant in TS | Meaning |
|-------|----------------|---------|
| `session_ready` | `SocketEvents.SESSION_READY` | Connected; role and ids confirmed |
| `new_order` | `SocketEvents.NEW_ORDER` | New marketplace order placed (checkout) |
| `order_request` | `SocketEvents.ORDER_REQUEST` | Unassigned delivery job entered the driver pool (zone FCM topics) |
| `order_status_changed` | `SocketEvents.ORDER_STATUS_CHANGED` | Order row updated after a status-changing REST call |

### 3.2 Client → server (`.emit`)

| Event | Constant in TS | Meaning |
|-------|----------------|---------|
| `watch_order` | `ClientEvents.WATCH_ORDER` | Join room `order:{id}` for one order (use ack) |
| `unwatch_order` | `ClientEvents.UNWATCH_ORDER` | Leave `order:{id}` (no ack) |

---

## 4. Auto-rooms (no Flutter code)

On connect, the server joins one default room per role:

| Role | Room | Receives by default |
|------|------|---------------------|
| Vendor | `restaurant:{restaurantId}` | `new_order`, `order_status_changed` for that restaurant |
| Customer | `user:{userId}` | `order_status_changed` when payload includes your `user_id` |
| Driver | `delivery_man:{deliveryManId}` plus `topic:{fcmTopic}` from login | `order_request` on zone/vehicle topics; `order_status_changed` when assigned or on pool topic when another driver accepts |

`watch_order` additionally joins `order:{orderId}` so all parties on that order get the same status events.

---

## 5. Who receives what (matrix)

| Event | Vendor | Consumer | Driver |
|-------|--------|----------|--------|
| `session_ready` | Yes | Yes | Yes |
| `new_order` | **Yes** (`restaurant:*`) | **No** | **No** |
| `order_request` | **No** | **No** | **Yes** (`topic:*` — same strings as login `data.topic` / FCM) |
| `order_status_changed` | Yes (restaurant + optional `order:*`) | Yes (`user:*` + optional `order:*`) | Assigned orders: **`delivery_man_id` = you**; pool: **`topic:*`** when job is taken (+ optional `order:*`) |

### 5.1 When the backend emits

| Trigger | Socket effect |
|---------|----------------|
| Consumer **places order** (marketplace) | `new_order` → vendor restaurant room; vendor FCM (see §8) |
| Vendor **`PUT /api/vendor/orders/:id/status`** | `order_status_changed` → restaurant, `order:{id}`, customer `user:{id}`, driver `delivery_man:{id}` if assigned; **`order_request`** → driver zone topics when order is unassigned and pool-eligible |
| Driver **`PUT /api/delivery-man/orders/:id/accept`** | `order_status_changed` (order now has `delivery_man_id`) |
| Driver **`PUT /api/delivery-man/orders/:id/status`** | `order_status_changed` |

Consumer checkout does **not** emit a dedicated “your order was placed” socket to the customer app; use REST response + optional FCM. Tracking uses `watch_order` + `order_status_changed`.

### 5.2 Driver “Order Request” pool (important)

Unassigned jobs in the zone **do not** arrive via `new_order` (that event is vendor-only).

| Mechanism | Use for new request cards |
|-----------|---------------------------|
| **`GET /api/delivery-man/orders/latest`** | Source of truth for pool cards (poll on tab open, interval, or after push/socket) |
| **`order_request` socket** | While app is open — play sound, refetch **`/latest`** |
| **FCM topic** from login `data.topic` | Wake app / refresh list when backgrounded (see §8.3) |
| **`order_status_changed` on same topics** | Another driver accepted — remove card / refetch **`/latest`** |

---

## 6. Payloads

### 6.1 `session_ready`

**Vendor:**

```json
{
  "role": "vendor",
  "restaurant_id": 42
}
```

**Consumer:**

```json
{
  "role": "customer",
  "user_id": 99
}
```

**Driver:**

```json
{
  "role": "delivery_man",
  "delivery_man_id": 7
}
```

---

### 6.2 `new_order` (vendor only)

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

**Flutter:** Play sound, show banner, refresh list. Load full card via **`GET /api/vendor/orders/:id`**.

**Vendor POS reliability (mandatory):** Even when the socket is connected, poll every ~10s while logged in:

`GET /api/vendor/orders/recent?after_id={lastSeenOrderId}` — dedupe by `order_id`, play sound/print in separate try/catch, reconnect on resume and after `connect_error`.

In-store **POS-only** orders may not emit `new_order` (same as legacy: marketplace checkout path).

---

### 6.3 `order_request` (driver pool)

```json
{
  "order_id": "100178",
  "restaurant_id": 42,
  "order_amount": 210,
  "order_type": "delivery",
  "payment_method": "cash_on_delivery",
  "order_status": "confirmed",
  "zone_id": 2,
  "vehicle_id": 1
}
```

**Flutter:** Play request sound, then **`GET /api/delivery-man/orders/latest`** for full cards (images, address, map coords). Filter client-side by vehicle if needed.

---

### 6.4 `order_status_changed` (all roles that match rooms)

```json
{
  "order_id": "100178",
  "restaurant_id": 42,
  "user_id": "99",
  "delivery_man_id": "7",
  "order_status": "processing",
  "order_amount": 210,
  "order_type": "delivery",
  "payment_method": "cash_on_delivery",
  "updated_at": "2026-09-28T18:30:00.000Z"
}
```

| Field | Type | Notes |
|-------|------|--------|
| `order_id` | `string` | |
| `restaurant_id` | `number` | |
| `user_id` | `string` \| `null` | Customer room when set |
| `delivery_man_id` | `string` \| `null` | Driver room when set and matches |
| `order_status` | `string` | DB value (`pending`, `confirmed`, `accepted`, `processing`, `handover`, `picked_up`, `delivered`, `canceled`, …) |
| `order_amount` | `number` | |
| `order_type` | `string` | |
| `payment_method` | `string` \| `null` | |
| `updated_at` | ISO-8601 | |

Socket payload is **summary only** — refetch order detail from the role’s REST API when UI needs items, addresses, or fees.

---

### 6.5 `watch_order` / ack

**Emit:**

```json
{ "order_id": "100178" }
```

Use **`emitWithAck`**. Server responses:

| Result | JSON |
|--------|------|
| OK | `{ "ok": true, "order_id": "100178" }` |
| Bad id | `{ "ok": false, "msg": "Invalid order_id" }` |
| No access | `{ "ok": false, "msg": "Forbidden" }` |

**Forbidden** covers: unknown order, POS order (`order_type === "pos"`), wrong restaurant (vendor), wrong customer, driver not assigned to this order.

**`unwatch_order`:** same `{ "order_id" }` body; **no ack**. Invalid ids are ignored silently.

---

## 7. Screen guide by app

### 7.1 Vendor POS

| Screen | REST | Socket listen | Socket emit |
|--------|------|---------------|-------------|
| Login | `POST /api/vendor/login` | — | — |
| Shell / Active orders | `GET /api/vendor/orders` | Connect; `session_ready`, **`new_order`**, `order_status_changed` | — |
| Order detail | `GET /api/vendor/orders/:id` | `order_status_changed` | `watch_order` / `unwatch_order` |
| Kitchen / status buttons | **`PUT /api/vendor/orders/:id/status`** | Other tablets get `order_status_changed` | — |
| Background | — | Prefer FCM + poll fallback | — |

### 7.2 Consumer

| Screen | REST | Socket |
|--------|------|--------|
| Login | `POST /api/consumer/login` | Connect after token |
| Order tracking | `GET` order detail | `watch_order`; listen `order_status_changed` |
| Leave tracking | — | `unwatch_order` |
| Home / catalog | REST only | Optional: stay connected for future events |
| Background | FCM (update token via profile APIs) | Do not rely on socket |

### 7.3 Driver

| Screen | REST | Socket | FCM |
|--------|------|--------|-----|
| Login | `POST /api/delivery-man/login` | Connect; subscribe **`data.topic`** | Topic subscription |
| **Order Request** | **`GET /api/delivery-man/orders/latest`** | Stay connected (no pool event) | Refresh list on notification |
| Accept / Ignore | **`PUT .../orders/:id/accept`** (ignore = don’t call accept; card disappears for others via their poll) | After accept: `order_status_changed` | — |
| **Home / active trip** | `GET /api/delivery-man/orders/active` | `watch_order` + `order_status_changed` | Optional |
| Status (picked up, delivered, …) | **`PUT .../orders/:id/status`** | `order_status_changed` | — |
| My Orders / History | `GET .../history` | `order_status_changed` for assigned orders | — |

---

## 8. FCM (push) by role

Sockets do not replace push when the app is not in the foreground.

### 8.1 Vendor

On new marketplace order, backend may send FCM to vendor **`firebase_token`** or **`fcm_token_web`** (see `src/utils/notifications/sendNewOrderNotification.ts`).

Typical **data** fields:

| Key | Example |
|-----|---------|
| `type` | `new_order` |
| `order_id` | `100178` |
| `order_type` | `delivery` |
| `title` / `body` | Notification text |

Ensure POS registers/updates FCM token with vendor profile APIs as per your app integration.

### 8.2 Consumer

Store **`fcm_token`** on login/register (`POST /api/consumer/login` body) and update via profile (**legacy:** `PUT` firebase token on customer profile).  
Order-status pushes depend on server/legacy configuration; **tracking UI should still use socket + REST**.

### 8.3 Driver

Login response includes **`data.topic`** — subscribe in Firebase Messaging:

| Driver setup | Topic pattern |
|--------------|----------------|
| Zone + vehicle | `delivery_man_{zoneId}_{vehicleId}` |
| Zone-wise | DB `zones.deliveryman_wise_topic` or `zone_{zoneId}_delivery_man` |
| Restaurant-wise | `restaurant_dm_{restaurantId}` |

Use FCM to **open Order Request** or trigger **`GET /orders/latest`** when backgrounded.  
While the app is **foreground** and connected, listen for **`order_request`** (same topic membership as FCM).

---

## 9. Recommended `GizraRealtimeService` (Dart)

One service can serve all apps; register only the listeners you need per role.

```dart
class GizraRealtimeService {
  IO.Socket? _socket;

  void start({
    required String apiUrl,
    required String jwt,
    required void Function(Map<String, dynamic> payload) onSessionReady,
    void Function(Map<String, dynamic> payload)? onNewOrder,
    void Function(Map<String, dynamic> payload)? onOrderRequest,
    void Function(Map<String, dynamic> payload)? onOrderStatusChanged,
  }) {
    stop();
    _socket = connectGizraSocket(apiBaseUrl: apiUrl, jwt: jwt);
    _socket!.on('session_ready', (d) => onSessionReady(Map<String, dynamic>.from(d)));
    if (onNewOrder != null) {
      _socket!.on('new_order', (d) => onNewOrder(Map<String, dynamic>.from(d)));
    }
    if (onOrderRequest != null) {
      _socket!.on('order_request', (d) => onOrderRequest(Map<String, dynamic>.from(d)));
    }
    _socket!.on('order_status_changed', (d) {
      onOrderStatusChanged?.call(Map<String, dynamic>.from(d));
    });
    _socket!.on('connect_error', (_) { /* re-login if Unauthorized */ });
  }

  void watchOrder(String orderId, void Function(Map<String, dynamic> ack) onAck) {
    _socket?.emitWithAck('watch_order', {'order_id': orderId}, ack: (data) {
      onAck(Map<String, dynamic>.from(data as Map));
    });
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

## 10. REST quick reference (used with sockets)

Base prefix: **`/api`**. Header: **`Authorization: Bearer {jwt}`** unless noted.

| Role | Login | Order list / detail | Status / actions |
|------|-------|---------------------|------------------|
| Vendor | `POST /vendor/login` | `GET /vendor/orders`, `GET /vendor/orders/:id` | `PUT /vendor/orders/:id/status` |
| Consumer | `POST /consumer/login` | Consumer order APIs | (status via vendor/driver) |
| Driver | `POST /delivery-man/login` | `GET /delivery-man/orders/latest`, `active`, `history` | `PUT /delivery-man/orders/:id/accept`, `PUT .../status` |

Swagger: merged driver overlay + main `swagger.json`; run `npm run swagger:gen` locally.

---

## 11. Errors & debugging

| Symptom | Likely cause |
|---------|----------------|
| `connect_error`: Unauthorized | Wrong/expired JWT; vendor/driver logged in elsewhere |
| Vendor never gets `new_order` | Wrong restaurant JWT, socket disconnected, or order not marketplace checkout |
| Consumer never gets status | Not in tracking / no `watch_order`; order `user_id` mismatch |
| Driver never gets status on pool | Normal — not assigned yet; use `/latest` |
| Driver gets status after accept only | Expected until assigned |
| Events on one server only in prod | Set **`REDIS_URL`** for Socket.IO Redis adapter (multi-instance) |

**Local test scripts:** `gizra-backend/scripts/socket/` (`help.js`, vendor token + listen).

---

## 12. Known gaps / roadmap

1. **Customer “order placed”** — no dedicated socket; use checkout response.
3. **Vendor web panel** may use **SSE** (`GET /vendor/orders/events`); Flutter vendor app should use **`new_order`**, not SSE.
4. Kitchen notes / dispatch extras — REST only; no extra socket events yet.

---

## 13. One-page cheat sheet

```
CONNECT     auth.token = JWT from role login     path /socket.io

LISTEN      session_ready
            new_order              → vendor only
            order_request          → driver (topic rooms = FCM topics)
            order_status_changed   → vendor, customer (user room), driver (assigned + pool topics)

EMIT        watch_order { order_id }     → ack ok | Invalid order_id | Forbidden
            unwatch_order { order_id }   → no ack

ACTIONS     always REST first (PUT status, accept, checkout, …)

BACKGROUND  FCM (vendor token, consumer token, driver topic)

DRIVER POOL GET /delivery-man/orders/latest  + order_request socket + FCM

TYPES       src/types/sockets/realtime.ts
```
