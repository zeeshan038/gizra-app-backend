# Flutter / Customer App — Pizza Half / Whole (חצי / שלם)

**Audience:** Customer (StackFood-based) mobile team  
**Backend:** Gizra API (`gizra-backend`)  
**Scope:** Display + payload only — **no extra pricing**  
**Related:** [Menu variations](./FLUTTER-MENU-VARIATIONS-INTEGRATION.md) · [Cart](./FLUTTER-CART-IMPLEMENTATION.md) · [Server-authoritative cart](./FLUTTER-CART-SERVER-AUTHORITATIVE.md)  
**OpenAPI:** `gizra_customer.openapi.json` — `add_on_placements`, cart line `variation_options`  
**Last updated:** March 2026

---

## 1. What this feature does

When a restaurant enables half/whole on a **variation group** or on **add-ons**, the customer tags **each selected topping** (or add-on) for the kitchen:

| API code | Customer UI (Hebrew) | Kitchen / receipt | Meaning |
|----------|----------------------|-------------------|---------|
| `whole` | שלם | שלם (optional suffix) | Full pizza — **default** |
| `half_a` | חצי א' (ימין) | חצי א' | First half — often shown as “right” in UI |
| `half_b` | חצי ב' (שמאל) | חצי ב' | Second half — often shown as “left” in UI |

**Prices do not change.** `unitFood` and cart `price` are the same whether the user picks שלם, חצי א', or חצי ב'.

The kitchen sees labels on orders and receipts, for example: `זיתים (חצי א')`.

**Restaurant Panel (vendor):**

- **Variations tab** → per group: **Pizza half / whole (חצי / שלם)** → sets `enablePizzaHalfWhole: true` on that group in the menu API.
- **Add-ons tab** → food-level switch → sets `addons_pizza_half_whole: true` on the food object.

---

## 2. When to show the selector

### 2.1 Variation groups (typical pizza toppings)

On **product details**, for each variation **group** where:

```json
"enablePizzaHalfWhole": true
```

Show a placement control for **every checked option** in that group.

| Group `type` | Show when |
|--------------|-----------|
| `multi` | Each selected topping row |
| `single` | The one selected option (if vendor enabled half/whole on that group) |

Works with any `selectionMode` (`standard`, `opt_out`, `opt_in`) — the flag is independent of pricing rules.

If `enablePizzaHalfWhole` is **false** or missing: hide the control; treat placement as **`whole`** (you may omit fields in the payload — server defaults to `whole`).

**Menu API group example:**

```json
{
  "name": "תוספות",
  "type": "multi",
  "selectionMode": "standard",
  "required": "off",
  "min": "0",
  "max": "10",
  "enablePizzaHalfWhole": true,
  "values": [
    { "label": "זיתים", "optionPrice": 5, "price": 5 },
    { "label": "פטריות", "optionPrice": 4, "price": 4 }
  ]
}
```

Reload menu after the vendor saves; flags come from the server only.

### 2.2 Add-ons tab

When the food object has:

```json
"addons_pizza_half_whole": true
```

Show the same שלם / חצי א' / חצי ב' control on **each selected add-on** row (parallel to `add_on_ids` / `add_on_qtys`).

**Food-level example:**

```json
{
  "id": 102,
  "name": "פיצה משפחתית",
  "price": 49,
  "addons_pizza_half_whole": true,
  "add_ons": [ ... ]
}
```

---

## 3. Placement values (what to send)

Send **exactly one** string per topping / add-on. Server accepts **case-insensitive** API codes and normalizes aliases (e.g. `right` → `half_a`, `left` → `half_b`, Hebrew labels — see `pizzaPlacement.ts`).

| Send on wire | Notes |
|--------------|--------|
| `whole` | Default if missing |
| `half_a` | Prefer these three codes in the app |
| `half_b` | |

**Do not** add a half surcharge on the client. **Do not** change `price` when the user toggles placement.

### 3.1 Accepted aliases (server normalizes)

For debugging and legacy payloads only — **Flutter should send `whole` / `half_a` / `half_b`:**

| Input (examples) | Normalized |
|------------------|------------|
| `שלם`, `full` | `whole` |
| `right`, `first_half`, `חצי א'` | `half_a` |
| `left`, `second_half`, `חצי ב'` | `half_b` |

---

## 4. Product-screen UX

For each **selected** option in an `enablePizzaHalfWhole` group (and each add-on when `addons_pizza_half_whole` is true):

1. Keep existing name + price row.
2. Add a **segmented control** or three chips: **שלם** | **חצי א'** | **חצי ב'** (optional ימין / שמאל hints under א/ב).
3. Default new selections to **`whole`**.
4. When the user unchecks a topping, remove its placement from local state (do not send it in cart).

Keep state keyed by stable ids, e.g. `(groupName, optionLabel)` for variations and `addOnId` for add-ons, so cart payloads stay consistent after navigation.

**Hebrew on tickets:** The app sends **codes** only. Vendor POS / receipts get kitchen strings from the API (`kitchen_label`, `variation_kitchen_lines`, etc.). You do **not** need to append `(חצי א')` on the client for print.

---

## 5. Cart & checkout payloads

Base path: `{API_BASE}/consumer/cart` — see [FLUTTER-CART-IMPLEMENTATION.md](./FLUTTER-CART-IMPLEMENTATION.md).

### 5.1 Variations — `variation_options`

Put placement on **each selected value object** inside `variation_options` (detailed picks). Use **`pizzaPlacement`** (camelCase) or **`pizza_placement`** (snake_case).

Also send StackFood-style **`variations`** (summary) if you already do today; for **pricing**, when both are present the server uses **`variation_options`** for variation surcharges — avoid double-counting on the client. See [menu doc §5.6](./FLUTTER-MENU-VARIATIONS-INTEGRATION.md).

**Example — add to cart:**

```json
{
  "restaurant_id": 3,
  "item_id": 102,
  "item_type": "Food",
  "price": 58,
  "quantity": 1,
  "variations": [
    { "name": "תוספות", "type": "multi", "values": ["זיתים", "תירס"] }
  ],
  "variation_options": [
    {
      "name": "תוספות",
      "type": "multi",
      "values": [
        { "label": "זיתים", "pizzaPlacement": "half_a" },
        { "label": "תירס", "pizzaPlacement": "whole" }
      ]
    }
  ],
  "add_on_ids": [12, 15],
  "add_on_qtys": [1, 1],
  "add_on_placements": ["whole", "half_b"]
}
```

If you only send string labels in `variation_options.values` **without** `pizzaPlacement`, the kitchen treats every topping as **whole**.

### 5.2 Add-ons — `add_on_placements`

Parallel array to **`add_on_ids`** (and **`add_on_qtys`**):

```json
{
  "add_on_ids": [12, 15],
  "add_on_qtys": [1, 1],
  "add_on_placements": ["half_b", "whole"]
}
```

Index `i` is placement for `add_on_ids[i]`. Wrong order maps the wrong half to the wrong topping.

When all add-ons are whole, you may send `"whole"` for each entry or rely on server defaults — but if **any** add-on is half, send explicit placements for merge safety (§6).

### 5.3 Place order

Order line items use the **same shapes** as cart: `variation_options` with `pizzaPlacement`, and `add_on_placements`.

---

## 6. Cart GET — restore UI

Stored lines return placements unchanged:

```json
{
  "variation_options": [
    {
      "name": "תוספות",
      "values": [
        { "label": "זיתים", "pizzaPlacement": "half_a" }
      ]
    }
  ],
  "add_on_placements": ["whole", "half_a"]
}
```

Use these when opening the cart or re-editing a line.

---

## 7. Line identity (merge vs separate rows)

Two `POST /consumer/cart/add` calls merge into **one** row only when **all** of these match:

`item_id` + `item_type` + `variations` + `variation_options` + `add_on_ids` + **`add_on_placements`**

Same pizza with **זיתים half_a** vs **זיתים half_b** must be **two cart lines**, not `quantity: 2` on one line.

Include `add_on_placements` and full `variation_options` (with placements) whenever halves differ between otherwise identical configs.

---

## 8. Flutter implementation checklist

- [ ] Parse `enablePizzaHalfWhole` on each `ConsumerFoodVariationGroup` (menu / food detail).
- [ ] Parse `addons_pizza_half_whole` on food.
- [ ] Placement UI per selected variation option / add-on when the flag is on.
- [ ] Default `pizzaPlacement: "whole"` for new selections.
- [ ] Send placements on `POST /consumer/cart/add`, update, and place-order.
- [ ] **Never** adjust `price` / footer total when placement changes.
- [ ] Persist from GET cart `data` into local cart models.
- [ ] QA: identical items, different half → two cart rows.

---

## 9. Manual QA

1. Vendor enables **Pizza half/whole** on the toppings group (Restaurant Panel).
2. Customer picks **זיתים** → **half_a**, **פטריות** → **whole**.
3. Add to cart → GET cart shows `pizzaPlacement` on those values.
4. Footer total = base + variation prices **with no half surcharge**.
5. Place order → vendor order shows Hebrew half labels on kitchen lines.

**Backend smoke (no app):**

```bash
cd gizra-backend && npx ts-node scripts/test-pizza-placement.ts
```

---

## 10. Common mistakes

| Mistake | Result |
|---------|--------|
| Changing `price` when user picks half | Wrong totals / checkout mismatch |
| Only string labels in `variation_options` without `pizzaPlacement` | Kitchen sees everything as whole |
| `add_on_placements` order does not match `add_on_ids` | Wrong half on wrong add-on |
| Omitting placements when halves differ | Lines incorrectly merge |
| Merging cart rows client-side ignoring `add_on_placements` | Lost half/whole data |

---

## 11. Reference

| Topic | Location |
|-------|----------|
| Variation group field `enablePizzaHalfWhole` | [FLUTTER-MENU-VARIATIONS-INTEGRATION.md](./FLUTTER-MENU-VARIATIONS-INTEGRATION.md) §2.1 |
| Cart fields & endpoints | [FLUTTER-CART-IMPLEMENTATION.md](./FLUTTER-CART-IMPLEMENTATION.md) |
| Merge key | [FLUTTER-CART-SERVER-AUTHORITATIVE.md](./FLUTTER-CART-SERVER-AUTHORITATIVE.md) |
| Normalization & kitchen suffixes | `gizra-backend/src/utils/order/pizzaPlacement.ts` |
| Cart validation | `gizra-backend/src/schemas/consumer/Cart.ts` |
| Order validation | `gizra-backend/src/schemas/consumer/Order.ts` |