# Admin coupon API reference

Used by **Admin Panel** → Promotions → Coupons (`adminPannel` → `promotionsApi.js`).

**Base URL:** `https://backend-dev.gizra.app/api`  
**Auth:** `Authorization: Bearer <admin JWT>` on every call.

Customer side: [CONSUMER-COUPON-API.md](./CONSUMER-COUPON-API.md) — codes are **private** (not listed in app).

---

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/admin/coupons/list` | Paginated list |
| `GET` | `/admin/coupons/:id` | One coupon (includes `code`) |
| `POST` | `/admin/coupons` | Create |
| `PUT` | `/admin/coupons/:id` | Update |
| `PATCH` | `/admin/coupons/:id/status` | Enable / disable |
| `DELETE` | `/admin/coupons/:id` | Delete |

---

## Create / update body

```json
{
  "titles": {
    "default": "Summer 10%",
    "en": "Summer 10%",
    "he": "קיץ 10%"
  },
  "code": "SUMMER20",
  "coupon_type": "restaurant_wise",
  "restaurant_ids": [3],
  "customer_ids": ["all"],
  "limit": 1,
  "start_date": "2026-01-01",
  "expire_date": "2026-12-31",
  "discount": 10,
  "discount_type": "percent",
  "max_discount": 25,
  "min_purchase": 50
}
```

| Field | Notes |
|-------|--------|
| `code` | Unique; copy from admin UI and share externally |
| `coupon_type` | `zone_wise` → `zone_ids`; `restaurant_wise` → `restaurant_ids`; `first_order`, `free_delivery`, `default` |
| `customer_ids` | `["all"]` or specific user ids — only those users can apply |
| `limit` | Max successful uses **per customer**; backend defaults to **1** if empty |

---

## Create response `201`

```json
{
  "status": true,
  "msg": "Coupon added successfully",
  "data": {
    "id": 12,
    "code": "SUMMER20",
    "coupon_type": "restaurant_wise",
    "limit": 1,
    "status": true,
    ...
  }
}
```

---

## List response `200`

```json
{
  "status": true,
  "msg": "Success",
  "data": {
    "data": [ { "id": 12, "code": "SUMMER20", ... } ],
    "total": 5,
    "page": 1,
    "limit": 15
  }
}
```

Query: `?search=summer&page=1&limit=15`

---

## Do you need new admin APIs?

**No.** The Admin Panel already calls these routes. Recent backend changes:

1. **Consumer** list endpoints return empty (codes stay admin-only).
2. **Default `limit` = 1** per customer when admin omits limit.
3. **Swagger:** `swagger-admin.json` tag **Admin Coupons** after `npm run swagger:gen`.

Optional admin UX only: remind staff to share `code` off-app and set `limit` to 1.