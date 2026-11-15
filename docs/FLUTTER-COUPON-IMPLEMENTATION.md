# Flutter — private coupon codes (admin issued)

**Full URLs, query, body, responses:** [CONSUMER-COUPON-API.md](./CONSUMER-COUPON-API.md)  
**OpenAPI:** `gizra_customer.openapi.json` → **Consumer Coupons**

## Product flow

1. **Admin** creates a coupon in Admin Panel → gets a **code** (e.g. `VIP2026`).
2. Admin **sends the code** outside the app (SMS, WhatsApp, influencer, in-person).
3. **Customer never sees a coupon list** in the app — all list endpoints return `data: []`.
4. At **checkout**, customer **types the code**.
5. Optional: **Apply** → `GET /consumer/coupon/apply?code=...&restaurant_id=...&order_amount=...` (logged-in only).
6. **Place order** with the same `coupon_code` — server validates again and applies discount **once per account**.

---

## One code, one use per customer

- Default **limit = 1** per customer per coupon (new admin coupons).
- Re-use blocked with: `This coupon has already been used on your account`.
- Canceled/failed orders do **not** count as used; a successful order with that code does.

---

## Restrict to one person (optional)

In Admin Panel, set **customers** to a specific user id instead of **All**.  
Only that logged-in account can apply the code.

---

## APIs

| Endpoint | Purpose |
|----------|---------|
| `GET /consumer/coupon/list` | Always `{ status: true, data: [] }` — **do not build UI** |
| `GET /consumer/coupon/restaurant-wise` | Same |
| `GET /consumer/restaurants/coupons` | Same |
| `GET /consumer/coupon/apply` | Validate typed code (no `code` in response body) |
| `POST /consumer/place-order` | `coupon_code` in body — **authoritative** |

**Auth:** Guest cannot use coupons — registered customer JWT only.

---

## Checkout UI

- One text field: **Promo code**
- **Apply** (optional preview)
- **Place order** must send the same string as `coupon_code`

---

## Admin

- Codes visible only in Admin Panel.
- Do not put codes in push notification body if you want them private (use “Enter your code at checkout”).