# Flutter — private coupon codes (summary)

**Full handoff for mobile:** **[FLUTTER-COUPON-CHECKOUT.md](./FLUTTER-COUPON-CHECKOUT.md)** ← share this with the Flutter team

**OpenAPI:** `gizra_customer.openapi.json` → **Consumer Coupons**  
**Endpoints:** [CONSUMER-COUPON-API.md](./CONSUMER-COUPON-API.md)

## Product flow

1. Admin creates a code in Admin Panel and shares it **outside the app**.
2. Customer **types** the code at checkout (no in-app coupon list).
3. Optional: `GET /consumer/coupon/apply` for preview.
4. `POST /consumer/order/place` with `coupon_code` — server applies discount; **one use per account** by default.

## Flutter must do

- Promo text field + Apply at checkout (registered users only).
- **Do not** build UI from `/coupon/list`, `/restaurant-wise`, or `/restaurants/coupons` (always empty).
- Send same `coupon_code` on place order as user typed.

See **FLUTTER-COUPON-CHECKOUT.md** for UI, errors, examples, and checklist.