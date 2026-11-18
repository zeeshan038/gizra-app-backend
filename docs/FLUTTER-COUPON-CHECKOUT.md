# Flutter — coupon / promo code at checkout

**Audience:** Customer app developers  
**OpenAPI:** `gizra_customer.openapi.json` → tag **Consumer Coupons**  
**API reference:** [CONSUMER-COUPON-API.md](./CONSUMER-COUPON-API.md)  
**Base URL (dev):** `https://backend-dev.gizra.app/api`  
**Base URL (prod):** `https://backend.gizra.app/api`

---

## 1. Product rules (read first)

| Rule | Detail |
|------|--------|
| **No coupon discovery in app** | Admin shares codes via video, SMS, WhatsApp, etc. |
| **No public lists** | List endpoints always return `data: []` — **do not build** “available coupons” UI |
| **Manual entry only** | One text field: “Promo code” at checkout |
| **Registered users only** | Guest JWT **cannot** use coupons (`/coupon/apply` requires login) |
| **One use per account** | Default: each code works **once per customer** on a successful order |
| **Apply vs place order** | `GET /coupon/apply` = optional **preview**; `POST /order/place` with `coupon_code` = **authoritative** |

---

## 2. What to remove in the app (legacy StackFood)

- Restaurant detail “coupons” carousel / chips  
- “Tap to apply” from API lists  
- Expecting `code` from list responses  
- Auto-applying from push deep links without user typing (optional: open checkout only)

---

## 3. Checkout UI (minimum)

```
┌─────────────────────────────────────┐
│  Promo code  [____________] [Apply] │
│  ✓ 10% off applied (−₪15.05)      │  ← after successful apply
└─────────────────────────────────────┘
```

1. User types code (trim whitespace).  
2. **Apply** → validate with cart **food subtotal** (`order_amount`).  
3. Show discount from `coupon_discount_amount` (or refresh order quote if you use quote).  
4. **Place order** → send the **same** string in `coupon_code`.  
5. On place-order coupon error, show server `msg`.

**Guests:** Hide promo field or show “Log in to use a promo code”.

---

## 4. API — validate (preview)

| | |
|--|--|
| **Method** | `GET` |
| **Path** | `/consumer/coupon/apply` |
| **Example** | `GET /api/consumer/coupon/apply?code=SUMMER20&restaurant_id=3&order_amount=150.5` |

### Headers

```http
Authorization: Bearer <customer JWT>
```

### Query

| Parameter | Required | Description |
|-----------|----------|-------------|
| `code` | Yes | User input |
| `restaurant_id` | Yes | Checkout restaurant id |
| `order_amount` | Recommended | Food subtotal **before** coupon (min purchase + % calculation) |

### Success `200`

```json
{
  "status": true,
  "data": {
    "id": 12,
    "title": "10% off",
    "discount": 10,
    "discount_type": "percent",
    "min_purchase": 50,
    "max_discount": 25,
    "coupon_discount_amount": 15.05,
    "enter_code_at_checkout": true
  }
}
```

Response **does not** include `code`.

### Errors

| HTTP | Typical `msg` |
|------|----------------|
| 404 | Coupon not found |
| 403 | Not eligible / minimum purchase not met |
| 406 | This coupon has already been used on your account |
| 407 | Coupon expired |

```json
{ "status": false, "msg": "..." }
```

---

## 5. API — place order (authoritative)

| | |
|--|--|
| **Method** | `POST` |
| **Path** | `/consumer/order/place` |

Add to the existing place-order JSON:

```json
{
  "restaurant_id": 3,
  "coupon_code": "SUMMER20",
  "order_type": "delivery",
  "payment_method": "cash_on_delivery"
}
```

Server re-validates. Coupon failure → often **403** with `msg` (may include `code: "coupon"`).

Use order response / `pricing_breakdown` for final totals (e.g. `coupon_discount_amount`).

Optional: **`POST /consumer/order/quote`** with the same `coupon_code` before place for checkout UI totals.

---

## 6. Legacy list endpoints (do not use for UI)

Safe to **stop calling**; if still called, treat `data` as always empty:

| Method | Path |
|--------|------|
| GET | `/consumer/coupon/list?zone_id=…` |
| GET | `/consumer/coupon/restaurant-wise?zone_id=…&restaurant_id=…` |
| GET | `/consumer/restaurants/coupons?restaurant_id=…` |

### Response `200`

```json
{
  "status": true,
  "data": [],
  "msg": "Coupons are applied at checkout with a code you received separately"
}
```

---

## 7. End-to-end flow

```text
User receives SUMMER20 (video/SMS)
  → opens checkout, types code
  → GET /consumer/coupon/apply?code=SUMMER20&restaurant_id=3&order_amount=<subtotal>
  → UI shows coupon_discount_amount
  → POST /consumer/order/place { ..., "coupon_code": "SUMMER20" }
  → second attempt with same code → 406 already used
```

---

## 8. Flutter checklist

- [ ] Checkout: promo field + Apply (logged-in only)  
- [ ] Apply: pass `order_amount` = food subtotal for restaurant  
- [ ] Place order: same `coupon_code` string  
- [ ] Handle 406 with friendly copy  
- [ ] Remove restaurant/home coupon widgets  
- [ ] Models from `gizra_customer.openapi.json` (Consumer Coupons)

---

## 9. Suggested Dart flow (pseudocode)

```dart
Future<void> applyPromoCode({
  required String code,
  required int restaurantId,
  required double orderAmount,
}) async {
  final res = await api.get(
    '/consumer/coupon/apply',
    query: {
      'code': code.trim(),
      'restaurant_id': restaurantId,
      'order_amount': orderAmount,
    },
  );
  if (res.status && res.data != null) {
    state.code = code.trim();
    state.discountPreview = res.data['coupon_discount_amount'];
  } else {
    showError(res.msg);
  }
}

Future<void> placeOrder(...) async {
  await api.post('/consumer/order/place', body: {
    ...checkoutBody,
    if (state.code != null && state.code!.isNotEmpty)
      'coupon_code': state.code,
  });
}
```

---

## 10. Deploy

Private coupon behavior (empty lists, no code in apply response, one use per user) requires the **matching backend** on the environment the app uses.

---

## 11. Related docs

| File | Purpose |
|------|---------|
| [CONSUMER-COUPON-API.md](./CONSUMER-COUPON-API.md) | Full endpoint reference |
| [FLUTTER-COUPON-IMPLEMENTATION.md](./FLUTTER-COUPON-IMPLEMENTATION.md) | Short summary |
| [ADMIN-COUPON-API.md](./ADMIN-COUPON-API.md) | Admin panel only |