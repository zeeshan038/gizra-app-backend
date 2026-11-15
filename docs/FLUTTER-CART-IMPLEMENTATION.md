# Flutter — server-authoritative cart (implementation guide)

**Audience:** Customer app (Flutter) developers  
**Backend:** Gizra Node API  
**Related:** [Menu variations & modifiers](./FLUTTER-MENU-VARIATIONS-INTEGRATION.md) (pricing, `variations`) · **[Pizza half/whole](./FLUTTER-PIZZA-HALF-WHOLE.md)** (kitchen tags, `pizzaPlacement`, `add_on_placements`)  
**OpenAPI:** `gizra_customer.openapi.json` → schema `ConsumerCartLineItem`

---

## Summary

Stop persisting the cart on the device. The app should:

1. Call the cart APIs with **Bearer JWT** (customer or guest).
2. Use the **`data`** array (or single line from add/update) as the **only** source of truth for cart UI and checkout.
3. **Never** invent `title`, `image_url`, `restaurant_name`, or line totals from local menu cache alone — the server returns display fields on every read/mutation.

**Base path:** `{API_BASE}/consumer/cart`  
Example dev: `https://backend-dev.gizra.app/api/consumer/cart`

Trailing slashes match existing StackFood-style routes (`/cart/`, `/cart/add`, etc.).

---

## Authentication

| User | Header |
|------|--------|
| Logged-in customer | `Authorization: Bearer <customer JWT>` |
| Guest | `Authorization: Bearer <guest JWT>` from `POST /consumer/guest/request` |

**All cart routes require this header.** Legacy `is_guest: true` + `guest_id` in body/query still works if you cannot send a guest JWT, but **prefer Bearer** for add/update/remove/clear.

After **login / Google sign-in**, include `guest_id` in the auth body so the backend merges the guest cart into the customer account (existing Gizra behavior).

---

## Cart line model (`ConsumerCartLineItem`)

Map this from JSON on every GET / add / update / add-multiple response.

```json
{
  "id": "501",
  "user_id": "88",
  "is_guest": false,
  "restaurant_id": "3",
  "restaurant_name": "Pizza Palace",
  "item_id": "102",
  "item_type": "Food",
  "title": "Morning Shakshuka",
  "image_url": "https://cdn.example/food.jpg",
  "quantity": 2,
  "price": 55,
  "unit_base_price": 45,
  "unit_addons_total": 10,
  "add_on_ids": [4, 7],
  "add_on_qtys": [1, 2],
  "add_on_placements": ["whole", "half_a"],
  "variations": [{ "type": "Size", "value": "Large" }],
  "variation_options": [],
  "is_available_now": true,
  "availability_status": "available",
  "is_in_stock": true,
  "stock_status": "in_stock",
  "current_stock": 12
}
```

| Field | App usage |
|-------|-----------|
| `id` | **Cart row id** — use for `cart_id` on update and path on remove (**not** `item_id`) |
| `price` | **Unit** price including add-ons (what user stored at add time) |
| `unit_base_price` / `unit_addons_total` | Optional breakdown in cart row UI |
| **Line subtotal** | `price × quantity` (client math for display only; checkout still uses server cart) |
| `restaurant_id` / `restaurant_name` | Cart header / “ordering from” badge — take from **first line** or any line (same restaurant enforced) |
| Stock / selling fields | Disable checkout or show warning when `is_available_now == false` or `is_in_stock == false` |

Always expect **arrays** for `add_on_ids`, `add_on_qtys`, `variations`, `variation_options`, `add_on_placements` (empty `[]` when none).

---

## Endpoint reference

### 1. Load cart — `GET /consumer/cart/`

**Request:** Bearer only (no body).

**Response:**

```json
{ "status": true, "data": [ /* ConsumerCartLineItem[] */ ] }
```

Empty cart: `{ "status": true, "data": [] }`.

**When to call:** App open (if cart tab exists), entering cart screen, after **any** failed mutation (refresh), after login merge.

---

### 2. Add line — `POST /consumer/cart/add`

**Required body:**

| Field | Type | Notes |
|-------|------|--------|
| `restaurant_id` | number | **Required** — restaurant user is ordering from |
| `item_id` | number | Food id |
| `item_type` | string | `"Food"` or `"ItemCampaign"` |
| `price` | number | Unit price **including** add-ons (same as product screen total for qty 1) |
| `quantity` | int | ≥ 1 |
| `add_on_ids` / `add_on_qtys` | arrays | Parallel indices |
| `add_on_placements` | string[] | `whole`, `half_a`, `half_b` — see [menu doc](./FLUTTER-MENU-VARIATIONS-INTEGRATION.md) |
| `variations` / `variation_options` | arrays | As today on place-order |

Optional: `is_guest`, `guest_id` (legacy only).

**Success:**

| HTTP | Meaning | Action in app |
|------|---------|----------------|
| **201** | New cart row | Replace/add line in UI from `data` **or** refetch GET |
| **200** | Same “line identity” already in cart; **quantity increased** | Update UI from `data` (merged qty) |

Both return:

```json
{
  "status": true,
  "msg": "...",
  "data": { /* single ConsumerCartLineItem */ }
}
```

**Do not** treat “duplicate line” as an error — merging is **200**, not 400/403.

**One restaurant per cart:** If cart has items from restaurant A and user adds from restaurant B:

```json
{ "status": false, "msg": "Your cart already contains items from another restaurant." }
```

HTTP **403** — show dialog: clear cart or keep current restaurant.

**Selling time / stock** (unchanged):

```json
{
  "status": false,
  "msg": "...",
  "code": "food_selling_time",
  "availability_status": "not_yet_available"
}
```

```json
{
  "status": false,
  "msg": "...",
  "code": "food_stock",
  "stock_status": "out_of_stock",
  "current_stock": 0
}
```

HTTP **403** — show `msg` to user.

**Line identity (when server merges two adds):**  
Same `item_id` + `item_type` + `variations` + `variation_options` + `add_on_ids` + `add_on_placements` (JSON compared on server).  
For pizza half/whole you **must** send distinct `add_on_placements` / `variation_options` or lines will incorrectly merge.

---

### 3. Set quantity — `PUT /consumer/cart/update`

```json
{ "cart_id": "501", "quantity": 3 }
```

- `cart_id` = cart row `id` from GET (string or number accepted).
- `quantity` is **absolute**, not delta.
- `quantity < 1` → line **deleted**:

```json
{ "status": true, "msg": "Cart updated successfully", "data": null }
```

- Success with line: `data` = one `ConsumerCartLineItem`.
- **404** — row gone (refresh GET).
- **403** — not your cart row.

**UI:** Minus button on qty `1` can either call update with `0` or `DELETE remove-item` (both valid).

---

### 4. Remove one line — `DELETE /consumer/cart/remove-item/{id}`

`{id}` = cart row `id`.

```json
{ "status": true, "msg": "Removed" }
```

**404** if already removed.

---

### 5. Clear cart — `DELETE /consumer/cart/clear/{user_id}`

- Path `user_id` must equal the id in the JWT (customer user id or guest id).
- Guest legacy (no JWT): `?is_guest=true` plus matching `user_id`.

```json
{ "status": true, "msg": "Cart cleared completely" }
```

Idempotent if cart already empty.

---

### 6. Re-order — `POST /consumer/cart/add-multiple`

**Replaces** the entire cart (not append). Use for “order again”.

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
      "variations": [{ "type": "Size", "value": "Large" }],
      "variation_options": [],
      "add_on_placements": []
    }
  ]
}
```

**Response:**

```json
{ "status": true, "data": [ /* full cart, same shape as GET */ ] }
```

If **any** item fails validation (stock, selling time, wrong restaurant), the cart is **unchanged** — HTTP **403** with `code` / `msg` for the first failure.

Backend also accepts legacy key `item_list` instead of `items`.

---

## Recommended app architecture

```text
CartRepository
  ├─ fetchCart()           → GET /
  ├─ addLine(payload)      → POST /add  (handle 200 vs 201)
  ├─ setQuantity(id, qty)  → PUT /update
  ├─ removeLine(id)        → DELETE /remove-item/{id}
  ├─ clearCart()           → DELETE /clear/{userId}
  └─ replaceCart(reorder)  → POST /add-multiple

CartBloc / Provider
  └─ state = List<ConsumerCartLineItem> from server only
```

**Product detail → add:** Build payload from product screen (price, variations, add-ons), include **`restaurant_id`** from the restaurant context (menu route / food detail API).

**After add:** Either merge `response.data` into state or call `fetchCart()` — refetch is simpler and avoids drift.

**Cart badge count:** `sum(line.quantity)` over GET `data`.

**Checkout:** Continue using existing place-order API; cart rows on server should match what user sees. Keep sending the same variation/add-on shapes you send on add.

---

## UI checklist

- [ ] Remove Hive/SharedPreferences/local JSON cart persistence (or use only as offline cache **disabled** for v1).
- [ ] Cart screen binds to GET `data` only.
- [ ] Show `restaurant_name` from API (not cached restaurant object).
- [ ] Use `image_url` and `title` from line item.
- [ ] Qty stepper uses `id` + PUT update.
- [ ] Swipe delete uses `id` + DELETE remove-item.
- [ ] “Add from another restaurant” → catch 403 and offer clear cart.
- [ ] Handle add **200** (merged) and **201** (new).
- [ ] Re-order screen calls add-multiple then navigates to cart with returned `data`.
- [ ] Guest → login: existing auth merge; then GET cart.

---

## Example add payload (from product screen)

```dart
// Pseudocode — align with your ApiClient
await api.post('/consumer/cart/add', body: {
  'restaurant_id': restaurantId,
  'item_id': food.id,
  'item_type': 'Food',
  'price': unitTotalIncludingAddons, // matches footer on PDP
  'quantity': 1,
  'add_on_ids': selectedAddonIds,
  'add_on_qtys': selectedAddonQtys,
  'add_on_placements': selectedAddonPlacements,
  'variations': variationPayload,
  'variation_options': variationOptionsPayload,
});
```

---

## Deploy note

This behavior ships with the backend branch that includes server-authoritative cart. Confirm with backend that **dev** is deployed before QA. Until then, local cart + old add responses will not match this doc.

---

## Questions

| Topic | Where |
|-------|--------|
| Variation pricing, Burger Box, pizza placements | [FLUTTER-MENU-VARIATIONS-INTEGRATION.md](./FLUTTER-MENU-VARIATIONS-INTEGRATION.md) |
| OpenAPI field types | `gizra_customer.openapi.json` |
| Backend cart source | `src/controllers/consumer/Cart.ts` |

**Short spec (sections 1–6 only):** [FLUTTER-CART-SERVER-AUTHORITATIVE.md](./FLUTTER-CART-SERVER-AUTHORITATIVE.md)