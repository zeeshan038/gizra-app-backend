# POS / Vendor — Request Gizra driver delivery fee

Handoff for the **POS mobile app** (and any vendor client) to auto-quote delivery fee on **Request Gizra driver**, matching Admin Panel and Restaurant Web Panel.

**Base URL:** `{API_HOST}/api`  
**Swagger:** `{API_HOST}/swagger/vendor` (`swagger-vendor.json`)  
**Auth:** `Authorization: Bearer <vendor JWT>` from `POST /vendor/login` (same token as Restaurant Panel / POS)

**Envelope:**

```json
{ "status": true, "msg": "…", "data": { … } }
```

Errors: `{ "status": false, "msg": "…" }` (HTTP 4xx/5xx).

---

## Goal

When the user sets a delivery pin/address on **Request Gizra driver**:

1. Call the delivery-fee quote API.
2. Prefill **Delivery fee (paid to driver)** with `data.delivery_fee`.
3. Allow the user to adjust the fee.
4. Submit that fee on `POST /vendor/dispatch/request-driver`.

**No new backend work** — endpoints already exist and are used by Restaurant Panel.

| Client | Quote | Request driver |
|--------|-------|----------------|
| Restaurant Panel | `GET /vendor/dispatch/delivery-fee` | `POST /vendor/dispatch/request-driver` |
| POS mobile | **same** | **same** |
| Admin Panel | `GET /admin/dispatch/delivery-fee` (+ `restaurant_id`) | `POST /admin/dispatch/request-driver` |

POS must **not** use admin routes. Restaurant id comes from the vendor JWT.

---

## 1. Quote delivery fee

**GET** `/vendor/dispatch/delivery-fee`

### Query

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `destination_lat` | number \| string | yes | Delivery pin latitude |
| `destination_lng` | number \| string | yes | Delivery pin longitude |

### Example

```http
GET /api/vendor/dispatch/delivery-fee?destination_lat=32.0853&destination_lng=34.7818
Authorization: Bearer <vendor_jwt>
```

### Success `data` (shape)

| Field | Type | Use in UI |
|-------|------|-----------|
| `delivery_fee` | number | Prefill fee field (editable) |
| `original_delivery_fee` | number | Fee before free-delivery (manual dispatch does not zero this) |
| `distance_km` | number | Show distance |
| `distance_source` | string | `google` or `cache` (Routes API DRIVE) — debug / support |
| `pricing.base_fee` | number | Breakdown |
| `pricing.base_distance_km` | number | Breakdown |
| `pricing.extra_per_km` | number | Breakdown |
| `pricing.extra_km` | number | Breakdown |
| `pricing.subtotal_before_surge` | number | Optional |
| `pricing.surge_percent` | number | Optional |
| `warning` | object \| omitted | Soft warning — still show quoted fee |
| `warning.message` | string | Show as warning banner |
| `restaurant_id` | number | Echo of restaurant from JWT context |

### Example response

```json
{
  "status": true,
  "msg": "Delivery fee quoted",
  "data": {
    "restaurant_id": 12,
    "distance_km": 3.2,
    "distance_source": "google",
    "delivery_fee": 18,
    "original_delivery_fee": 18,
    "pricing": {
      "base_fee": 15,
      "base_distance_km": 2,
      "extra_per_km": 3,
      "extra_km": 1.2,
      "subtotal_before_surge": 18,
      "surge_percent": 0
    }
  }
}
```

### Errors

Show `msg` to the user. Clear or keep previous fee based on product choice (Restaurant Panel clears quote state and shows an error alert).

---

## 2. Request Gizra driver (unchanged contract)

**POST** `/vendor/dispatch/request-driver`

Requires **Manual Dispatch** enabled for the restaurant (Business Setup / restaurant config). Admin can still dispatch when the toggle is off; **POS cannot**.

### Body (required)

| Field | Type | Notes |
|-------|------|--------|
| `customer_name` | string | max 100 |
| `customer_phone` | string | max 30 |
| `address` | string | Delivery address text |
| `order_amount` | number | Food subtotal (≥ 0.01) |
| `delivery_fee` | number | From quote (or user-adjusted), ≥ 0 |
| `payment_method` | string | `cash_on_delivery` \| `prepaid` |
| `idempotency_key` | string | Unique per attempt; max 100. Retry with same key is safe |

### Body (recommended)

| Field | Type | Notes |
|-------|------|--------|
| `latitude` | number | Same pin used for quote |
| `longitude` | number | Same pin used for quote |
| `restaurant_order_ref` | string | POS / ticket number (aliases: `restaurant_order_number`, `pos_order_number`, `pos_order_id`, `external_order_id`) |

### Example

```json
{
  "customer_name": "Yossi Cohen",
  "customer_phone": "+972501234567",
  "address": "12 Herzl St, Tel Aviv",
  "latitude": 32.0853,
  "longitude": 34.7818,
  "order_amount": 85,
  "delivery_fee": 18,
  "payment_method": "cash_on_delivery",
  "idempotency_key": "pos-dispatch-2026-04-05-001",
  "restaurant_order_ref": "4521"
}
```

### Success `data` (typical)

| Field | Meaning |
|-------|---------|
| `order_id` | Gizra `orders.id` (string) |
| `commission_rate` | % on food |
| `commission` | Gizra commission amount |
| `delivery_fee` | Fee stored on order (to driver) |
| `gizra_charge` | commission + delivery_fee |
| `restaurant_net` | Settlement helper |
| `payment_status` | e.g. unpaid / paid |
| `restaurant_order_ref` | Echo when provided |

---

## 3. Recommended UI flow (mirror Restaurant Panel)

1. Gate screen: Manual Dispatch available + enabled (from restaurant setup / flags).
2. User fills customer name, phone, address map pin, food price, optional POS order ID, payment method.
3. When `latitude` + `longitude` are valid:
   - Debounce **~350ms**.
   - Call `GET /vendor/dispatch/delivery-fee`.
   - Set fee field = `data.delivery_fee`.
   - Optionally show distance + pricing line.
4. While quoting: show “Calculating…” and optionally disable the fee field.
5. On quote error: show `msg`; do not silently submit `0` unless product allows it.
6. On submit: send current fee field value as `delivery_fee`.
7. Generate a new `idempotency_key` per user submit (UUID). Reuse the same key only for retries of the same attempt.
8. Prefer HTTP timeout ≥ **60s** for request-driver if the device is slow; backend returns after order create (driver notify is async). Same key = no duplicate order.

### Optional client totals (display only)

Same as web panels (default commission **10%** of food; confirm against `commission_rate` in response if shown after submit):

- Customer pays ≈ `order_amount + delivery_fee`
- Gizra commission ≈ `order_amount * 0.10`
- Driver delivery fee = `delivery_fee`

---

## 4. Checklist for POS mobile

- [ ] Call `GET /vendor/dispatch/delivery-fee` after map pin / lat-lng is set
- [ ] Prefill editable delivery fee from `data.delivery_fee`
- [ ] Show distance / pricing / warning when present
- [ ] Handle quote errors with `msg`
- [ ] Submit `delivery_fee` on `POST /vendor/dispatch/request-driver`
- [ ] Send `latitude` / `longitude` with the request
- [ ] Unique `idempotency_key` per attempt
- [ ] Optional `restaurant_order_ref` for POS ticket number
- [ ] Manual Dispatch gate before showing the form

---

## 5. Reference implementations (this monorepo)

| Piece | Path |
|-------|------|
| Restaurant Panel page | `Restaurant Pannel/src/features/dispatch/pages/RequestGizraDriverPage.jsx` |
| Restaurant Panel API | `Restaurant Pannel/src/features/dispatch/dispatchApi.js` |
| Admin Panel page (admin JWT + `restaurant_id`) | `adminPannel/src/features/dispatch/pages/RequestGizraDriverPage.jsx` |
| Vendor controller | `gizra-backend/src/controllers/vendor/Dispatch.ts` |
| Shared quote logic | `gizra-backend/src/utils/delivery/quoteDeliveryFee.ts` |
| Related handoff | `gizra-backend/docs/FRONTEND_HANDOFF_DRIVER_AND_POS.md` (section 6 — request-driver + order ref) |

---

## 6. Quick curl smoke test

```bash
# 1) Login as vendor → copy data.token
curl -s -X POST "$API/api/vendor/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"…","password":"…"}'

# 2) Quote
curl -s "$API/api/vendor/dispatch/delivery-fee?destination_lat=32.0853&destination_lng=34.7818" \
  -H "Authorization: Bearer $TOKEN"

# 3) Request driver (use quoted delivery_fee)
curl -s -X POST "$API/api/vendor/dispatch/request-driver" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "Test Customer",
    "customer_phone": "+972501234567",
    "address": "12 Herzl St",
    "latitude": 32.0853,
    "longitude": 34.7818,
    "order_amount": 85,
    "delivery_fee": 18,
    "payment_method": "cash_on_delivery",
    "idempotency_key": "pos-fee-test-001",
    "restaurant_order_ref": "TICKET-1"
  }'
```
