# Flutter customer app — menu variations & Burger Box modifiers

**Audience:** Mobile (StackFood-based) developers  
**Backend:** Gizra Node API (`gizra-backend`)  
**Last updated:** March 2026  

This document covers **pricing**, **new modifier-group fields**, **selection UX** (included ingredients + capped paid upgrades), and **cart/checkout** alignment with the server.

---

## 1. Pricing rule (mandatory)

For every food line:

```text
unitFood = food.price + Σ(selected variation optionPrice per group)
lineFood = unitFood × quantity
orderFoodSubtotal = Σ(lineFood) + Σ(add-on lines) − discounts
```

| Component | Source |
|-----------|--------|
| **Base** | `food.price` from menu API (catalog base, not sum of options) |
| **Variations** | Sum of `optionPrice` (or `price`) for **selected** options only, **per group** |
| **Add-ons** | Separate `add_on_ids` / `add_on_qtys` on cart & place-order (not variation JSON) |

**Do not** treat variation options as full dish prices. Options are **deltas** (+0, +5, +10), except legacy data being normalized server-side.

**Footer on product screen** must include **`food.price`** when showing total. Summing only selected `optionPrice` without base produces **₪0** bugs on combo/burger items.

---

## 2. OpenAPI / Swagger (updated)

New fields are documented on consumer variation schemas. After backend pull, regenerate or read:

| File | Use |
|------|-----|
| `gizra-backend/gizra_customer.openapi.json` | **Primary** for mobile codegen / reference |
| `gizra-backend/swagger-customer.json` | Same customer surface (legacy bundle) |
| `gizra-backend/swagger.catalog.overlay.json` | Source overlay for catalog schemas + menu example |

**Schemas to extend in Dart models:**

- `ConsumerFoodVariationGroup`
- `ConsumerFoodVariationOption`

**Regenerate merged specs (backend repo):**

```bash
cd gizra-backend && npm run swagger:gen
```

### 2.1 New / important group fields (`ConsumerFoodVariationGroup`)

| Field | Type | Meaning |
|-------|------|--------|
| `name` | string | Group title (e.g. "Ingredients to Remove") |
| `type` | `"single"` \| `"multi"` | StackFood choice type |
| `required` | `"on"` \| `"off"` | Required group (string, not bool) |
| `min` | string | Min selections (multi) |
| `max` | string | Max selections (multi); opt-out groups use `"999"` |
| **`selectionMode`** | `"standard"` \| **`opt_out`** \| **`opt_in`** | See §3 |
| **`defaultSelectAll`** | boolean | If true, pre-select every option in this group on open |
| **`priceDisplay`** | `"included"` \| `"price"` | UI hint for zero-price included rows |
| `values` | array | Options (**always** `values` on consumer APIs, not `options`) |

### 2.2 New / important option fields (`ConsumerFoodVariationOption`)

| Field | Type | Meaning |
|-------|------|--------|
| `label` / `name` / `level` | string | Display + cart matching (prefer `label`) |
| `optionPrice` | number | Additive charge when selected |
| `price` | number | Same as `optionPrice` on consumer menu |
| **`priceTag`** | `"included"` (optional) | Show **"Included"** — **never "FREE"** |
| **`showPrice`** | boolean | If false, hide +₪0.00 (show Included or blank) |

---

## 3. Modifier group types (`selectionMode`)

Restaurants configure these in **Restaurant Panel → Add Item → Variations**. The API exposes the rules below.

### 3.1 `opt_out` — Default ingredients (included)

**Example:** Burger Box — Asado, onion, sauce included in base.

| Rule | App behavior |
|------|----------------|
| Initial state | **All** options in group **selected** (`defaultSelectAll: true` or `selectionMode == opt_out`) |
| User action | **Uncheck** = remove ingredient; **Check again** = put back |
| Price | Always **0**; total unchanged when toggling |
| Max | **No practical cap** (`max` is `"999"` from API — do not share max with other groups) |
| UI | `priceTag: included` or `showPrice: false` → label **"Included"** or no price text |

**Cart payload:** Send **selected** labels for ingredients still on the burger (StackFood shape: group `name` + `values.label` array).

### 3.2 `opt_in` — Paid upgrades with limit

**Example:** Up to 4 paid extras (cheese, egg, bacon…).

| Rule | App behavior |
|------|----------------|
| Initial state | **None** selected (`defaultSelectAll: false`) |
| User action | Check to add; each adds `optionPrice` to total |
| Max | Parse `max` as int (e.g. **4**); when `selectedCount >= max`, **disable unchecked** options |
| Swap | User may **uncheck** a selected upgrade to free a slot |
| UI | Show +₪ next to each option |

**Important:** Enforce max **per group**, not globally across the product.

### 3.3 `standard` — Sizes & custom groups

Existing StackFood behavior: single/multi, optional `min`/`max`, +price deltas.  
Example: Small +0, Medium +10, Large +20 on top of base.

### 3.4 Same product, two groups (Burger Box)

A complex burger may have **both** `opt_out` and `opt_in` on one item:

1. Group A — included ingredients (pre-selected, ₪0)  
2. Group B — paid upgrades (max 4, adds to total)  

Selection state and max limits are **independent** per group. Pricing is still:

`base + extrasFromGroupB only` (Group A contributes 0 when configured correctly).

---

## 4. Menu API endpoints

Variations are returned on food objects from consumer menu routes, e.g.:

- `GET /api/consumer/restaurants/{id}/foods` (paginated menu)
- Product detail / search endpoints that include `variations`

Processing pipeline on server: raw DB JSON → `variationsForMobileClient()` → normalized `values`, `selectionMode`, tags.

**Legacy items** without `selectionMode` may be inferred server-side (all-zero multi → opt_out; multi with max &lt; 999 and paid options → opt_in). Prefer explicit fields on new items.

---

## 5. Flutter implementation checklist

### 5.1 Models

- [ ] Parse `selectionMode`, `defaultSelectAll`, `priceDisplay` on **Variation** / group model (nullable for old menus).
- [ ] Parse `priceTag`, `showPrice` on **VariationOption** (nullable).
- [ ] Keep using `values` array on each group (ignore `options` on consumer responses).

### 5.2 Product detail — initialization

```dart
for each group in product.variations:
  if (group.defaultSelectAll == true || group.selectionMode == 'opt_out') {
    selectAllOptions(group);
  } else if (group.type == 'multi' && group.selectionMode == 'opt_in') {
    selectNone(group);
  }
  // else: existing StackFood defaults (required/min)
```

### 5.3 Product detail — multi select toggle

```dart
onToggle(option):
  if option already selected -> deselect (always allowed for opt_in max swap)
  else if group.type == multi:
    max = int.tryParse(group.max ?? '') ?? 999;
    if selectedCount(group) >= max -> return; // disable UI for unchecked rows
    select(option)
  recalculateFooterTotal();
```

Apply disabled state only to **unselected** options when at max.

### 5.4 Product detail — display price

```dart
double variationExtra = 0;
for (group in selectedVariations) {
  for (option in group.selectedOptions) {
    variationExtra += option.optionPrice ?? option.price ?? 0;
  }
}
double unitTotal = product.price + variationExtra;
// add-ons computed separately
```

### 5.5 Option row UI

| Condition | Show |
|-----------|------|
| `priceTag == 'included'` or (`showPrice == false` and price == 0) | **"Included"** or blank — **not "FREE"** |
| `showPrice == true` or price &gt; 0 | +₪ formatted `optionPrice` |

### 5.6 Cart & place order

- Send selected variations in existing StackFood format (`name` + selected labels / `values`).
- **Avoid double submission:** if both `variations` and `variation_options` are sent with the same picks, server uses one path — prefer **one** consistent field (see server `mergeCartLineVariations`).
- Add-ons: continue `add_on_ids` + `add_on_qtys`; do not mix paid upgrades into add-ons if they are configured as variation group `opt_in`.

Server recomputes unit food with `resolveCheckoutServerUnitBase` + `computeVariationExtra` — client total should match within normal rounding.

---

## 6. QA test item (manual UAT)

Create in Restaurant Panel (or use staging item **TEST Burger Box**):

| Tab | Setting |
|-----|---------|
| Details | Base **₪59** |
| Variations group 1 | Type: **Default ingredients** — Asado, Onion, Tomato (Included) |
| Variations group 2 | Type: **Limited optional picks**, max **4** — Cheese +5, Egg +4, Bacon +6, … |

| Step | Expected total |
|------|----------------|
| Open product (defaults) | **₪59** |
| Uncheck onion | **₪59** |
| Select Cheese + Egg | **₪68** |
| Select 4 upgrades | Sum base + 4 prices; 5th disabled |
| Add to cart → checkout | Same total as footer |

Backend automated check (no app):

```bash
cd gizra-backend && npm run test:burger-box-modifiers
```

---

## 7. Example JSON (menu response fragment)

See `swagger.catalog.overlay.json` → `GET /consumer/restaurants/{id}/foods` → example food **TEST Burger Box**, or:

```json
{
  "name": "TEST Burger Box",
  "price": 59,
  "variations": [
    {
      "name": "Ingredients to Remove",
      "type": "multi",
      "required": "off",
      "min": "0",
      "max": "999",
      "selectionMode": "opt_out",
      "defaultSelectAll": true,
      "priceDisplay": "included",
      "values": [
        { "label": "Asado", "optionPrice": 0, "priceTag": "included", "showPrice": false }
      ]
    },
    {
      "name": "Paid Upgrades",
      "type": "multi",
      "required": "off",
      "min": "0",
      "max": "4",
      "selectionMode": "opt_in",
      "defaultSelectAll": false,
      "priceDisplay": "price",
      "values": [
        { "label": "Extra Cheese", "optionPrice": 5, "showPrice": true }
      ]
    }
  ]
}
```

---

## 8. Backend reference (for debugging)

| Module | Role |
|--------|------|
| `src/utils/consumer/variationsForMobileClient.ts` | Menu JSON shape for Flutter |
| `src/utils/consumer/variationModifierGroups.ts` | opt_out / opt_in rules, Included tags |
| `src/utils/consumer/variationPricing.ts` | `computeVariationExtra` at checkout |
| `src/utils/consumer/checkoutFoodUnitPrice.ts` | Base + variations unit price |
| `scripts/test-burger-box-modifiers.ts` | Regression tests |

---

## 9. Out of scope (Restaurant Panel only)

First-time **Tour** / **Guide** on Listing Manager and Add Item drawer are **web panel** features (`localStorage`); no Flutter work required.

---

## 10. Contact / deploy notes

- Deploy **backend** before relying on new fields in production menus.
- Re-save or create items with new variation group types so DB JSON includes `selectionMode`.
- Pull latest `gizra_customer.openapi.json` after backend deploy and update Dart models accordingly.

**Questions:** Backend team — reference PR/files for Burger Box modifier groups and swagger.catalog.overlay.json schema updates.
