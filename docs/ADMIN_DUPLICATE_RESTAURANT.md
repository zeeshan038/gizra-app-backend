# Admin — Duplicate restaurant (full menu / new branch)

**Audience:** Admin panel + backend  
**Feature:** Clone an existing restaurant into a new vendor account, including full menu, so multi-branch brands don’t re-enter categories/foods manually.  
**Last updated:** 2026-11-25  

---

## API

```http
POST /api/admin/restaurants/{id}/duplicate
Authorization: Bearer {admin_token}
Content-Type: application/json
```

**Swagger:** `{BASE}/swagger/admin` → **Admin Restaurants** → `postAdminRestaurantDuplicate`

### Request body

| Field | Required | Notes |
|-------|----------|--------|
| `f_name` | yes | New vendor first name |
| `l_name` | no | |
| `phone` | yes | **Unique** new phone |
| `email` | yes | **Unique** new email |
| `password` | yes | Min 8 chars — new vendor login |
| `name` | no | Defaults to `"{source} (Copy)"` |
| `address` | no | Defaults to source address |
| `latitude` / `longitude` / `zone_id` | no | Defaults to source; must be inside zone if overridden |
| `include_menu` | no | Default `true` |

### Example

```json
{
  "f_name": "Branch",
  "l_name": "Manager",
  "phone": "+972501112233",
  "email": "kfc-branch2@example.com",
  "password": "password123",
  "name": "KFC – Branch 2",
  "include_menu": true
}
```

### Success `201`

```json
{
  "status": true,
  "msg": "Restaurant duplicated successfully",
  "data": {
    "source_restaurant_id": 3,
    "vendor_id": 88,
    "restaurant_id": 91,
    "include_menu": true,
    "categories_copied": 12,
    "addons_copied": 8,
    "foods_copied": 64
  }
}
```

---

## What is copied

| Copied | Notes |
|--------|--------|
| New `vendors` row | New credentials + Cloudflare storage id |
| `restaurants` settings | Delivery flags, tax, shipping tiers, model, media paths, etc. |
| Schedules | `restaurant_schedule` |
| Config | `restaurant_configs` |
| Notification settings | `restaurant_notification_settings` |
| Cuisines / tags / characteristics | Link tables |
| Restaurant translations | Name/address locales |
| **Menu** (if `include_menu`) | Categories (+ parent remap), add-ons (**ID remap** into `food.add_ons`), foods, legacy `variations` / `variation_options`, food tags / nutrition / allergies, food + category translations |

Counters (`order_count`, ratings, `sell_count`), pause fields, and `qr_code` / `slug` are reset.

## What is **not** copied

Orders, reviews, wallets/earnings, coupons, subscriptions, employees, delivery men, campaigns/ads, partner API keys, home-category placements, carts.

---

## Admin panel UX

- Restaurant **list**: Copy icon on each row  
- Restaurant **view**: **Duplicate** button  
- Modal collects new owner login + name; toggle “Copy full menu”  
- On success → navigates to **Edit** of the new restaurant (update map pin / zone if needed)

---

## Implementation files

| Layer | Path |
|-------|------|
| Util | `src/utils/admin/restaurants/duplicateAdminRestaurant.ts` |
| Schema | `src/schemas/admin/Restaurant.ts` → `adminDuplicateRestaurantSchema` |
| Controller | `src/controllers/admin/restaurant.ts` → `duplicateAdminRestaurantHandler` |
| Route | `POST /admin/restaurants/:id/duplicate` |
| Admin UI | `adminPannel/.../DuplicateRestaurantModal.jsx` |

---

## QA checklist

- [ ] Duplicate with menu → new restaurant shows same categories/foods/addons in vendor panel  
- [ ] Food add-on links still work (remapped IDs)  
- [ ] Duplicate without menu → empty catalog, settings/schedules present  
- [ ] Reusing source email/phone → 400  
- [ ] New vendor can log in with new password  
- [ ] Source restaurant unchanged  
