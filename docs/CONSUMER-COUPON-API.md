# Consumer coupon API reference

**OpenAPI:** `gizra_customer.openapi.json` → tag **Consumer Coupons**  
**Base URL:** `https://backend-dev.gizra.app/api` (production: `https://backend.gizra.app/api`)

Paths below are **after** `/api` (same as Swagger `servers[0].url`).

---

## 1. Validate code at checkout (preview)

| | |
|--|--|
| **Method** | `GET` |
| **URL** | `/consumer/coupon/apply` |
| **Full example** | `GET /api/consumer/coupon/apply?code=SUMMER20&restaurant_id=3&order_amount=150.5` |
| **Auth** | `Authorization: Bearer <customer JWT>` (**registered user**, not guest) |
| **Body** | None (query only) |

### Query parameters

| Name | Required | Type | Description |
|------|----------|------|-------------|
| `code` | Yes | string | Code the customer typed |
| `restaurant_id` | Yes | integer | Checkout restaurant |
| `order_amount` | No | number | Food subtotal before coupon (min purchase + discount preview) |

### Response `200`

```json
{
  "status": true,
  "data": {
    "id": 12,
    "title": "10% off",
    "start_date": "2026-01-01T00:00:00.000Z",
    "expire_date": "2026-12-31T00:00:00.000Z",
    "min_purchase": 50,
    "max_discount": 25,
    "discount": 10,
    "discount_type": "percent",
    "coupon_type": "default",
    "restaurant_id": null,
    "coupon_discount_amount": 15.05,
    "enter_code_at_checkout": true
  }
}
```

**Note:** Response does **not** include `code` (customer already typed it).

### Error responses

| HTTP | Example `msg` |
|------|----------------|
| 403 | `You are not eligible for this coupon` |
| 403 | `Minimum purchase not met for coupon` |
| 404 | `Coupon not found` |
| 406 | `This coupon has already been used on your account` |
| 407 | `Coupon expired` |

```json
{ "status": false, "msg": "This coupon has already been used on your account" }
```

---

## 2. Apply discount on order (authoritative)

| | |
|--|--|
| **Method** | `POST` |
| **URL** | `/consumer/order/place` |
| **Full example** | `POST /api/consumer/order/place` |
| **Auth** | Customer or guest JWT (existing place-order rules) |
| **Schema** | `ConsumerPlaceOrderRequest` in OpenAPI (`coupon_code` field) |

### Request body (coupon fields only — rest of place-order unchanged)

```json
{
  "restaurant_id": 3,
  "order_type": "delivery",
  "payment_method": "cash_on_delivery",
  "coupon_code": "SUMMER20",
  "distance": 2.5,
  "delivery_address_id": 10
}
```

Server **re-validates** the coupon and applies discount to totals. Same errors as apply (403 with message; place-order may include `code: "coupon"` in error JSON).

### Response `200` (excerpt)

```json
{
  "status": true,
  "msg": "Order placed successfully",
  "order_id": "1001",
  "pricing_breakdown": {
    "subtotal": 135.45,
    "coupon_discount_amount": 15.05,
    "order_amount": 142.5
  }
}
```

Exact pricing fields: see **Consumer Order** → `POST /consumer/order/place` in `gizra_customer.openapi.json`.

---

## 3. Legacy list endpoints (always empty — do not build UI)

All return the same shape; **no coupon codes**.

### 3a `GET /consumer/coupon/list`

- **Auth:** Bearer customer JWT  
- **Query:** `zone_id` (required), optional `restaurant_id`  
- **Example:** `GET /api/consumer/coupon/list?zone_id=1`

### 3b `GET /consumer/coupon/restaurant-wise`

- **Auth:** None  
- **Query:** `zone_id`, `restaurant_id` (required)  
- **Example:** `GET /api/consumer/coupon/restaurant-wise?zone_id=1&restaurant_id=3`

### 3c `GET /consumer/restaurants/coupons`

- **Auth:** None  
- **Query:** `restaurant_id` (required), optional `customer_id`  
- **Example:** `GET /api/consumer/restaurants/coupons?restaurant_id=3`

### Response `200` (all three)

```json
{
  "status": true,
  "data": [],
  "msg": "Coupons are applied at checkout with a code you received separately"
}
```

---

## Flutter flow

```text
User types SUMMER20
  → GET .../coupon/apply?code=SUMMER20&restaurant_id=3&order_amount=<subtotal>
  → show coupon_discount_amount in UI
  → POST .../order/place with "coupon_code": "SUMMER20"
```

See also: [FLUTTER-COUPON-IMPLEMENTATION.md](./FLUTTER-COUPON-IMPLEMENTATION.md)