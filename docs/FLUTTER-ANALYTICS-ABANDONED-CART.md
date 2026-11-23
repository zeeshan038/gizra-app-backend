# Flutter: User funnel analytics + abandoned cart (WhatsApp recovery)

Backend owns **event storage**, **Super Admin funnel**, **abandoned cart detection (15–20 min)**, and an **env-gated WhatsApp bot webhook**.  
No Firebase Analytics / PostHog required for v1. Twilio/WhatsApp keys are optional until the client provides them.

## 1. Track funnel events

`POST /api/consumer/analytics/events`  
Auth: consumer JWT (or guest via existing `is_guest` + `guest_id` / guest token).

**OpenAPI / codegen:** `swagger-customer.json` and `gizra_customer.openapi.json` — tag **Consumer Analytics**, operationId `trackConsumerAnalyticsEvents`. Swagger UI: `{BASE}/swagger/customer`.

**Single event**

```json
{
  "event_name": "app_opened",
  "zone_id": 1,
  "client_session": "uuid-optional",
  "properties": { "lat": 32.08, "lng": 34.78 }
}
```

**Batch (preferred)**

```json
{
  "events": [
    { "event_name": "store_viewed", "restaurant_id": 12 },
    { "event_name": "product_viewed", "restaurant_id": 12, "properties": { "food_id": 99 } },
    { "event_name": "added_to_cart", "restaurant_id": 12, "properties": { "cart_total": 85.5 } },
    { "event_name": "checkout_started", "restaurant_id": 12 },
    { "event_name": "payment_failed", "properties": { "reason": "card_declined" } },
    { "event_name": "distance_blocked", "properties": { "code": "OUT_OF_ZONE" } }
  ]
}
```

### Required event names

| Event | When |
|-------|------|
| `app_opened` | App launch (+ zone / lat-lng in `properties`) |
| `store_viewed` | Enter restaurant |
| `product_viewed` | Open food detail |
| `added_to_cart` | Add to cart (also recorded server-side on cart APIs) |
| `checkout_started` | Open checkout / address / payment |
| `payment_failed` | Payment error |
| `distance_blocked` | Delivery restriction blocked order |
| `order_completed` | Also recorded server-side on successful place order |

`checkout_started` / `added_to_cart` from this API also **refresh** the abandoned-cart timer for logged-in users.

## 2. Abandoned cart (server)

- On cart add/update (logged-in): backend upserts an `active` session + snapshot + phone/name.
- Idle **`ABANDONED_CART_MINUTES`** (default **20**): status → `abandoned`.
- Place order: status → `recovered` (timer cancelled).
- Clear cart: status → `cancelled`.
- Guests are **not** tracked for WhatsApp recovery (no reliable phone).

## 3. WhatsApp bot webhook (keys only)

When a cart becomes abandoned, backend POSTs:

```json
{
  "event": "abandoned_cart",
  "abandoned_cart_id": "123",
  "abandoned_at": "2026-11-23T10:00:00.000Z",
  "customer": { "user_id": "45", "name": "Dana", "phone": "+9725..." },
  "restaurant": { "id": "12", "name": "Quatta Cafe" },
  "cart": { "total": 85.5, "items": [/* ... */], "snapshot": {} },
  "deeplink": "gizra://checkout?restaurant_id=12&abandoned_cart_id=123",
  "locale_hint": "he"
}
```

Headers:

- `Content-Type: application/json`
- `X-Gizra-Event: abandoned_cart`
- `X-Gizra-Abandoned-Cart-Id: …`
- `X-Gizra-Signature: <hmac-sha256 hex of raw body>` (only if `WHATSAPP_CART_RECOVERY_WEBHOOK_SECRET` set)

### Env (server)

```env
ABANDONED_CART_ENABLED=1
ABANDONED_CART_MINUTES=20
ABANDONED_CART_POLL_MS=60000
GIZRA_CUSTOMER_APP_DEEPLINK_BASE=gizra://checkout
WHATSAPP_CART_RECOVERY_ENABLED=0
WHATSAPP_CART_RECOVERY_WEBHOOK_URL=
WHATSAPP_CART_RECOVERY_WEBHOOK_SECRET=
```

With `WHATSAPP_CART_RECOVERY_ENABLED=0` or empty URL: carts still go `abandoned`, webhook is **skipped** (logged). Flip flag + URL when the bot is ready — **no code change**.

## 4. Deep link

Handle `GIZRA_CUSTOMER_APP_DEEPLINK_BASE` (default `gizra://checkout`) with query:

- `restaurant_id`
- `abandoned_cart_id`

Open checkout for that restaurant / restore cart UX.

## 5. Super Admin

- `GET /api/admin/analytics/funnel?from=&to=`
- `GET /api/admin/analytics/events/summary?from=&to=`
- `GET /api/admin/analytics/abandoned-carts?status=&page=&limit=`

## 6. DB migrate

```bash
# Prisma migrate, or one-shot SQL:
psql "$DATABASE_URL" -f scripts/sql/add-analytics-abandoned-cart.sql
npx prisma generate
```
