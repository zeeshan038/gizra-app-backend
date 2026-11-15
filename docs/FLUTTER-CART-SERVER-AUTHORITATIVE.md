# Server-authoritative consumer cart (Flutter handoff)

Base path: `/api/consumer/cart` — all routes require `verifyConsumer` (customer or guest Bearer JWT). Legacy `is_guest` + `guest_id` in body/query remains a fallback when no guest JWT is present.

## Auth

| Session | Header |
|---------|--------|
| Customer | `Authorization: Bearer <customer JWT>` |
| Guest | `Authorization: Bearer <guest JWT>` from `POST /consumer/guest/request` |

One cart per logged-in user; a separate cart per guest (`is_guest` on each line).

## 1. GET `/consumer/cart/`

Returns `{ "status": true, "data": [ ...lines ] }`. Empty cart: `data: []`.

Each line is fully enriched by the server (no local display fields required):

| Field | Notes |
|-------|--------|
| `id` | Cart row id (not food id) |
| `user_id`, `is_guest` | Owner |
| `restaurant_id`, `restaurant_name` | From food → restaurant |
| `item_id`, `item_type` | As stored |
| `title`, `image_url` | From food record |
| `quantity` | Line qty |
| `price` | **Unit** price including add-ons (as stored at add time) |
| `unit_base_price` | `price - unit_addons_total` |
| `unit_addons_total` | Sum of active add-on prices × qty for one unit |
| `add_on_ids`, `add_on_qtys`, `add_on_placements`, `variations`, `variation_options` | Exactly as stored (empty arrays when none) |
| `is_available_now`, `availability_status`, `is_in_stock`, `stock_status`, `current_stock` | Food items only |

## 2. POST `/consumer/cart/add`

Required body fields: `restaurant_id`, `item_id`, `item_type`, `price`, `quantity` (≥ 1), plus modifier arrays.

**One restaurant per cart:** if existing lines belong to another restaurant → **403** with a clear `msg`.

**Merge:** same line identity → increase quantity, **200** + enriched line.  
**New line:** **201** + enriched line.

**Line identity (merge key):** `item_id` + `item_type` + JSON(`variations`) + JSON(`variation_options`) + JSON(`add_on_ids`) + JSON(`add_on_placements`).  
Send `variation_options` and `add_on_placements` for pizza half/whole so distinct halves do not merge.

**403** with `code: food_selling_time` or `code: food_stock` unchanged.

## 3. PUT `/consumer/cart/update`

```json
{ "cart_id": "501", "quantity": 3 }
```

- Row must belong to the authenticated user/guest.
- `quantity` is **set**, not added.
- `quantity < 1` deletes the line → `{ "status": true, "data": null }`.
- **404** if row missing.

## 4. DELETE `/consumer/cart/remove-item/{id}`

Owner-only. **200** `{ "status": true, "msg": "Removed" }`. **404** if missing.

## 5. DELETE `/consumer/cart/clear/{user_id}`

Path `user_id` must match the token user/guest id. Query `is_guest=true` for guests (JWT guest session sets this automatically). **200** `{ "status": true, "msg": "Cart cleared completely" }`.

## 6. POST `/consumer/cart/add-multiple`

Re-order: **replaces** the whole cart in one transaction.

```json
{
  "restaurant_id": 3,
  "items": [
    {
      "item_id": 102,
      "item_type": "Food",
      "price": 55,
      "quantity": 2,
      "add_on_ids": [4],
      "add_on_qtys": [1],
      "variations": [],
      "variation_options": [],
      "add_on_placements": []
    }
  ]
}
```

Legacy field `item_list` is accepted instead of `items`.  
All foods must belong to `restaurant_id`. First validation failure → **403** (cart unchanged). Success → full GET-shaped `data` array.

## Migration checklist (app)

1. Remove local cart persistence; treat GET as source of truth after every mutation.
2. Always send `restaurant_id` on add and add-multiple.
3. Use returned `restaurant_id` / `restaurant_name` for badge UI.
4. Use `cart_id` (`id` on line) for update/remove.
5. Handle **200** on add (merge) and **201** (new line).