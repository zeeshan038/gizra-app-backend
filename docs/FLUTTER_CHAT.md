# In-app chat — Flutter guide (Consumer, Vendor, Driver)

**Audience:** Flutter developers  
**Backend:** `gizra-backend`  
**Base URL:** same as your REST API (e.g. `https://api.gizra.app/api`)  
**Swagger:** Customer / Vendor / Driver specs → tags **Consumer Chat**, **Vendor Chat**, **Delivery Man Chat**  
**Orders + other sockets:** see [FLUTTER_SOCKETS.md](./FLUTTER_SOCKETS.md)

---

## 1. Big picture (read this first)

Chat uses **three layers**. Use all of them in the app:

| Layer | When | What it does |
|--------|------|----------------|
| **REST** | User taps Send, opens inbox, opens a thread | Creates messages, loads history, marks read. **Always send here first.** |
| **Socket.IO** | App is open and connected | Instant update on the chat screen or inbox badge without polling. |
| **FCM** | App in background / killed | Notification “New message”; tap opens the thread. |

**Golden rule:** Typing and Send → **`POST …/message/send`**. On `chat_message` socket (or FCM), update UI or **refetch** `GET …/message/details` if you want to be 100% safe.

**Who can chat:**

| App | Auth | Chat allowed? |
|-----|------|----------------|
| Consumer | Bearer JWT (`role: customer`) | Yes — **registered users only** (not guest) |
| Vendor POS / panel | Bearer JWT (vendor session) | Yes |
| Driver | Bearer JWT (`role: delivery_man`) | Yes |

**Response shape (important):** Chat APIs return **flat JSON** like legacy PHP — **not** `{ status: true, data: { … } }`.

---

## 2. IDs cheat sheet (avoid wrong `receiver_id`)

| You want to talk to… | `receiver_type` | `receiver_id` is… |
|----------------------|-------------------|-------------------|
| Restaurant (from order / track) | `vendor` | **`vendors.id`** (not `restaurant_id`) |
| Driver (from order / track) | `delivery_man` | **`delivery_men.id`** |
| Customer (vendor or driver replying) | `customer` | **`users.id`** (customer account id) |
| Admin (consumer/vendor only) | `admin` | omit `receiver_id` |

**`conversation_id`** = thread id from list/details/send response. Reuse it for replies instead of `receiver_type` + `receiver_id`.

**`status` (boolean)** on details/send: `true` when there is an **active order** between the two parties (pending → picked_up). Use it to show/hide “Message” on order screens; sending is not always blocked when `false`.

---

## 3. REST APIs by role

All paths below are under **`/api`**. Every request needs:

```http
Authorization: Bearer <jwt>
```

Query **`offset`** = **page number** (PHP style), default `1`. **`limit`** default `10`.

---

### 3.1 Consumer app

Prefix: **`/consumer/message`**

| Action | Method | Path | Notes |
|--------|--------|------|--------|
| Inbox | GET | `/list` | Optional `?type=vendor` or `?type=delivery_man` |
| Search | GET | `/search-list` | Required `?name=…` |
| Open thread | GET | `/details` | `?conversation_id=` **or** `?vendor_id=` **or** `?delivery_man_id=` |
| Send | POST | `/send` | JSON body (see below) |
| Upload image | POST | `/chat-image` | `multipart/form-data`, field **`image`** → use URL in message / `file` JSON |

**List response key:** `conversations` (array).

**Send — new thread to restaurant:**

```json
POST /api/consumer/message/send
{
  "receiver_type": "vendor",
  "receiver_id": 3,
  "message": "Where is my order?"
}
```

**Send — reply in existing thread:**

```json
{
  "conversation_id": 4,
  "message": "Thanks!"
}
```

**Typical 200 send/details fields:** `total_size`, `limit`, `offset`, `status`, `message` (string `"successfully sent!"` on send), `messages[]`, `conversation` (with `sender`, `receiver`, `last_message`).

**Errors (validation):** `403` with `{ "errors": [{ "code": "validation", "message": "…" }] }`.

---

### 3.2 Vendor app (POS / restaurant panel)

Prefix: **`/vendor/message`**

| Action | Method | Path | Notes |
|--------|--------|------|--------|
| Inbox | GET | `/list` | Optional `?type=customer` or `?type=delivery_man` |
| Search | GET | `/search-list` | `?name=…` |
| Open thread | GET | `/details` | `?conversation_id=` **or** `?user_id=` (customer) **or** `?delivery_man_id=` |
| Send | POST | `/send` | JSON body |
| Upload image | POST | `/chat-image` | multipart `image` |

**List response key:** `conversation` (array) — **PHP uses this key name, not `conversations`.**

**Send — reply to customer:**

```json
POST /api/vendor/message/send
{
  "receiver_type": "customer",
  "receiver_id": 7,
  "message": "Your order is ready for pickup"
}
```

**Send — message assigned driver:**

```json
{
  "receiver_type": "delivery_man",
  "receiver_id": 12,
  "message": "Please call the customer at the gate"
}
```

---

### 3.3 Driver app

Prefix: **`/delivery-man/message`**

| Action | Method | Path | Notes |
|--------|--------|------|--------|
| Inbox | GET | `/list` | Optional `?type=customer` or `?type=vendor` |
| Search | GET | `/search-list` | `?name=…` |
| Open thread | GET | `/details` | `?conversation_id=` **or** `?user_id=` **or** `?vendor_id=` |
| Send | POST | `/send` | JSON body |
| Upload image | POST | `/chat-image` | multipart `image` |

**List response key:** `conversation` (array).

**Send — to customer:**

```json
POST /api/delivery-man/message/send
{
  "receiver_type": "customer",
  "receiver_id": 7,
  "message": "I am outside"
}
```

**Send — to restaurant:**

```json
{
  "receiver_type": "vendor",
  "receiver_id": 3,
  "message": "Order picked up"
}
```

---

## 4. Socket.IO for chat

Connection details (host, path, JWT, packages) are in **[FLUTTER_SOCKETS.md](./FLUTTER_SOCKETS.md)** §2.

### 4.1 Events you need for chat

**Server → client (listen with `.on`):**

| Event | When |
|--------|------|
| `session_ready` | Right after connect — confirms role and ids |
| `chat_message` | After **any** party calls `POST …/message/send` |

**Client → server (emit):**

| Event | Payload | Purpose |
|--------|---------|---------|
| `watch_conversation` | `{ "conversation_id": 4 }` | Join live thread room (use **ack**) |
| `unwatch_conversation` | `{ "conversation_id": 4 }` | Leave when leaving chat screen |

**Ack from `watch_conversation`:**

- Success: `{ "ok": true, "conversation_id": "4" }`
- Failure: `{ "ok": false, "msg": "Forbidden" }` (wrong user / not in thread)

### 4.2 `chat_message` payload shape

```json
{
  "conversation_id": "4",
  "message": {
    "id": 903,
    "conversation_id": 4,
    "sender_id": 11,
    "message": "Hello",
    "file": null,
    "is_seen": false,
    "created_at": "2026-03-01T10:00:00.000Z"
  },
  "sender_type": "customer",
  "receiver_type": "vendor",
  "receiver_user_info_id": 22
}
```

- Append `message` to the open thread if `conversation_id` matches.
- If inbox is visible, refresh **`GET …/message/list`** or bump unread on that row.

### 4.3 Rooms (what the server does for you)

On connect, the server already joins:

| Role | Auto room | You get `chat_message` when… |
|------|-----------|------------------------------|
| Customer | `user:{userId}` | Someone sends **to you** (inbox ping) |
| Vendor | `vendor:{vendorId}` | Customer/driver sends to this restaurant |
| Driver | `delivery_man:{deliveryManId}` | Customer/vendor sends to this driver |

**While the chat screen is open**, also call:

```dart
socket.emitWithAck('watch_conversation', {'conversation_id': conversationId}, ack: (data) {
  // handle ok / forbidden
});
```

When the user leaves the screen:

```dart
socket.emit('unwatch_conversation', {'conversation_id': conversationId});
```

You receive **`chat_message`** in both the **inbox room** and **`conversation:{id}`** if you watched that conversation.

### 4.4 Minimal Flutter chat socket snippet

```dart
void bindChatListeners(IO.Socket socket, {
  required void Function(Map<String, dynamic> payload) onChatMessage,
}) {
  socket.on('chat_message', (data) {
    if (data is Map) onChatMessage(Map<String, dynamic>.from(data));
  });
}

Future<bool> watchConversation(IO.Socket socket, int conversationId) async {
  final completer = Completer<bool>();
  socket.emitWithAck('watch_conversation', {'conversation_id': conversationId}, ack: (res) {
    if (res is Map && res['ok'] == true) {
      completer.complete(true);
    } else {
      completer.complete(false);
    }
  });
  return completer.future;
}
```

---

## 5. FCM for chat (background)

When the app is not on the chat screen, rely on **FCM** (same as StackFood-style apps).

Typical **data** fields:

| Field | Example | Meaning |
|--------|---------|---------|
| `type` | `message` | Open chat flow, not order status |
| `conversation_id` | `4` | Deep link to thread |
| `sender_type` | `user` / `vendor` / `delivery_man` | Who sent (customer often `user`) |
| `message` | JSON string of message row | Optional parse for preview |

**Device tokens:**

- Customer: `users.cm_firebase_token` (update via consumer firebase token API if you have one)
- Vendor: `vendors.firebase_token` / `fcm_token_web`
- Driver: `delivery_men.fcm_token` (`PUT /delivery-man/fcm-token`)

On notification tap: navigate to chat → **`GET …/message/details?conversation_id=`** → **`watch_conversation`**.

---

## 6. Screen-by-screen flows

### 6.1 Consumer — “Message restaurant” from track order

1. From order/track API, read **`vendor_id`** (or resolve from restaurant → vendor).
2. Optional: `GET /consumer/message/details?vendor_id=3` — empty messages if no thread yet.
3. User sends → `POST /consumer/message/send` with `receiver_type: vendor`, `receiver_id: 3`.
4. Save `conversation.id` from response.
5. On chat screen: connect socket (if not already), `watch_conversation(conversation.id)`, listen `chat_message`.

### 6.2 Consumer — “Message driver”

Same as above with `receiver_type: delivery_man` and `receiver_id: <delivery_man_id>` from the order.

### 6.3 Vendor — inbox → thread

1. `GET /vendor/message/list?type=customer`
2. Parse array from key **`conversation`**
3. Tap row → `GET /vendor/message/details?conversation_id=…`
4. `watch_conversation` + listen `chat_message`
5. Send → `POST /vendor/message/send` with `conversation_id` or `receiver_type` + `receiver_id`

### 6.4 Driver — customer on active delivery

1. From `GET /delivery-man/orders/:id`, get customer **`user_id`** and/or **`vendor_id`**.
2. `GET /delivery-man/message/details?user_id=7` or open list.
3. Send / socket same pattern as vendor.

---

## 7. Images in chat

1. `POST …/message/chat-image` with multipart field **`image`** (max 2 MB in Node implementation).
2. Response: `{ "image_url": "https://…" }`.
3. Include in send via `file` field as JSON string if your UI matches PHP (array of `{ img, storage }`), or send URL in `message` text until multipart send is added on `POST /send`.

---

## 8. Quick reference table

| Role | REST prefix | Inbox array key | Socket inbox room | Watch thread |
|------|-------------|-----------------|-------------------|--------------|
| Consumer | `/consumer/message` | `conversations` | `user:{userId}` | `watch_conversation` |
| Vendor | `/vendor/message` | `conversation` | `vendor:{vendorId}` | `watch_conversation` |
| Driver | `/delivery-man/message` | `conversation` | `delivery_man:{id}` | `watch_conversation` |

| Send to | Consumer `receiver_type` | Vendor `receiver_type` | Driver `receiver_type` |
|---------|--------------------------|-------------------------|-------------------------|
| Restaurant | `vendor` | — | `vendor` |
| Driver | `delivery_man` | `delivery_man` | — |
| Customer | — | `customer` | `customer` |
| Admin | `admin` | `admin` | — |

---

## 9. Testing checklist

- [ ] Login with correct JWT **role** for the app.
- [ ] Consumer: guest token must **not** call message APIs (401).
- [ ] Send from consumer → vendor sees FCM and/or `chat_message` on vendor socket.
- [ ] Vendor replies with `receiver_type: customer`, `receiver_id: users.id`.
- [ ] Driver ↔ customer on active order: `status: true` on details.
- [ ] Open thread: messages marked read on `GET …/details` (other party’s `is_seen` updates).
- [ ] Swagger examples: `/swagger/customer`, `/swagger/vendor`, `/swagger/driver`.

---

## 10. Related docs

- [FLUTTER_SOCKETS.md](./FLUTTER_SOCKETS.md) — connect, orders, `watch_order`, full event list  
- OpenAPI: `swagger-customer.json`, `swagger-vendor.json`, `swagger-driver.json` (Chat tags)  
- TypeScript contract: `src/types/sockets/realtime.ts` (`ChatMessagePayload`, `watch_conversation`)
