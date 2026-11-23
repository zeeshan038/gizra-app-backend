# Flutter — Multi-slot Combo Step Flow (e.g. 4-Burger Combo)

**Audience:** Customer app (Flutter / StackFood-based) developers  
**Backend:** Gizra Node API (`gizra-backend`) — **ready on development**  
**Related docs:**
- [Menu variations & Burger Box modifiers](./FLUTTER-MENU-VARIATIONS-INTEGRATION.md) — `selectionMode`, pricing deltas, opt_out / opt_in
- [Cart implementation](./FLUTTER-CART-IMPLEMENTATION.md) — server-authoritative cart lines
- [Pizza half/whole](./FLUTTER-PIZZA-HALF-WHOLE.md) — unrelated to burger combos; keep as-is for pizza only

**OpenAPI:** `gizra_customer.openapi.json` / `swagger-customer.json`  
Schemas: `FoodComboDefinition`, `ComboSlotSelection`, `ConsumerCartAddBody`, `ConsumerCartLineItem`, `ConsumerMenuFoodItem`

---

## 0. Problem & goal

**Problem:** For deals like a **4-Burger Combo**, showing every modifier for all 4 burgers on one long scrolling screen is confusing.

**Goal:** Step-by-step / accordion flow:

1. Collapsed steps: **Burger #1 … Burger #4**
2. Tap a step → configure that burger’s modifiers (same UI as a normal burger)
3. **Done / Next** → green check + short summary → auto-open next step
4. **Add to Cart** only when all required steps are complete

**Backend is done.** This doc is what Flutter must implement.

---

## 1. How to detect a combo item

On any menu / food-detail payload (`GET .../restaurants/{id}/foods`, food details, etc.), read:

```json
"combo_definition": {
  "enabled": true,
  "slot_count": 4,
  "slot_label": "Burger",
  "slot_labels": ["Burger #1", "Burger #2", "Burger #3", "Burger #4"],
  "steps": [
    { "slot_index": 1, "label": "Burger #1", "required": true },
    { "slot_index": 2, "label": "Burger #2", "required": true },
    { "slot_index": 3, "label": "Burger #3", "required": true },
    { "slot_index": 4, "label": "Burger #4", "required": true }
  ]
}
```

| Condition | App behavior |
|-----------|----------------|
| `combo_definition == null` OR `enabled != true` | **Existing** single-item product + modifiers screen (no change) |
| `combo_definition.enabled == true` | **New** step / accordion UI |

### Important: one shared modifier template

`food.variations` is the **template for every slot**.

- Do **not** expect 4 copies of groups in the catalog.
- For Burger #1 … #N, reuse the **same** `variations` list with **independent selection state** per slot.

---

## 2. Dart models (suggested)

```dart
class FoodComboDefinition {
  final bool enabled;
  final int slotCount;
  final String slotLabel;
  final List<String> slotLabels;
  final List<FoodComboStep> steps;

  bool get isCombo => enabled && slotCount >= 2;
}

class FoodComboStep {
  final int slotIndex; // 1-based
  final String label;
  final bool required;
}

class ComboSlotSelection {
  final int slotIndex;
  final String? slotLabel;
  /// Same shape you already send for normal items (prefer variation_options).
  final List<Map<String, dynamic>> variationOptions;
  final List<Map<String, dynamic>> variations; // optional alternate
}
```

Parse `combo_definition` on your food / product model (nullable).

---

## 3. Product screen UX (required)

### 3.1 Layout

1. Show **N collapsed rows** from `slot_labels` or `steps` (e.g. Burger #1 … Burger #4).
2. Each row states: incomplete / complete.
3. Complete row shows:
   - Green checkmark
   - Short text summary (e.g. `Medium · No onion · +Cheese`)

### 3.2 Editing a slot

1. Tap a row → open **modal** or expand **accordion**.
2. Inside: reuse the **existing** variation UI for one product:
   - `selectionMode: opt_out` → default all selected; uncheck to remove
   - `selectionMode: opt_in` → empty; enforce `max` per group
   - `selectionMode: standard` → single/multi as today  
   Full rules: [FLUTTER-MENU-VARIATIONS-INTEGRATION.md](./FLUTTER-MENU-VARIATIONS-INTEGRATION.md)

3. Keep **separate selection state per `slot_index`** in memory.

### 3.3 Done / Next

When user taps **Done** / **Next Burger**:

1. Validate that slot’s **required** groups (same rules as a normal item).
2. Mark slot complete; save summary string.
3. Auto-open the **next incomplete** required slot.
4. If this was the last slot, collapse and enable Add to Cart (if all complete).

### 3.4 Add to Cart button

- **Disabled** until every required step (`slot_count`) is complete.
- Server also validates; do not rely on UI alone.

### 3.5 Shared add-ons (optional)

Line-level `add_on_ids` / `add_on_qtys` still work **once** for the combo (not per burger), same as today.  
Per-slot add-ons are **not** required for v1.

---

## 4. Pricing (footer + cart)

```text
unit = food.price
     + Σ over each slot (Σ selected optionPrice in that slot)
     + add_ons (line level)
```

| Rule | Detail |
|------|--------|
| Base | Always include `food.price` once |
| Per slot | Sum deltas for that slot’s picks only |
| Same group name | May appear on every burger — charge **each** slot separately |
| Do not | Deduplicate by group name across slots (that under-charges) |

Example: base ₪120, Burger #2 has Extra Cheese (+5) + Egg (+4) → unit = **129** (before qty / other add-ons).

---

## 5. Cart API

### 5.1 Add to cart

`POST /api/consumer/cart/add`  
Auth: `Authorization: Bearer <customer or guest JWT>` (same as existing cart)

**Combo example:**

```json
{
  "restaurant_id": 3,
  "item_id": 9002,
  "item_type": "Food",
  "price": 129,
  "quantity": 1,
  "add_on_ids": [],
  "add_on_qtys": [],
  "variations": [],
  "variation_options": [],
  "combo_selections": [
    {
      "slot_index": 1,
      "slot_label": "Burger #1",
      "variation_options": [
        { "name": "Doneness", "values": { "label": ["Medium"] } }
      ]
    },
    {
      "slot_index": 2,
      "slot_label": "Burger #2",
      "variation_options": [
        { "name": "Doneness", "values": { "label": ["Well Done"] } },
        { "name": "Paid Upgrades", "values": { "label": ["Extra Cheese", "Egg"] } }
      ]
    },
    {
      "slot_index": 3,
      "slot_label": "Burger #3",
      "variation_options": [
        { "name": "Doneness", "values": { "label": ["Medium"] } }
      ]
    },
    {
      "slot_index": 4,
      "slot_label": "Burger #4",
      "variation_options": [
        { "name": "Doneness", "values": { "label": ["Medium"] } }
      ]
    }
  ]
}
```

### 5.2 Field rules

| Field | Combo item | Normal item |
|-------|------------|-------------|
| `combo_selections` | **Required** — one object per slot (`slot_index` 1…N) | `[]` or omit |
| Top-level `variations` / `variation_options` | Usually **`[]`** | As today |
| Inside each slot | Prefer `variation_options` (StackFood shape) | n/a |
| `price` | Unit total = base + all slot extras + add-ons | As today |

### 5.3 Errors

| HTTP | `code` | Meaning |
|------|--------|---------|
| 400 | `combo_incomplete` | Missing one or more slots |
| 400 | `combo_slot_incomplete` | A slot missing a required group (msg names the slot) |
| 403 | `food_selling_time` / `food_stock` | Existing rules |

Example:

```json
{
  "status": false,
  "msg": "Please complete all 4 burger selections",
  "code": "combo_incomplete"
}
```

### 5.4 Cart GET / response line

Every cart line may include:

```json
"combo_selections": [ /* same structure */ ]
```

- Empty / missing → treat as normal line.
- Non-empty → show per-slot summaries on the cart tile (e.g. 4 lines or “4 burgers configured”).

### 5.5 Place order / buy-now

Same `combo_selections` on each line item in:

- `POST /consumer/order/place`
- `POST /consumer/order/quote`
- Buy-now `items` / `cart` arrays

If checkout uses **DB cart**, ensure add-to-cart already stored `combo_selections` (server persists it on the cart row).

---

## 6. Order details (after place order)

There is **no** top-level `combo_selections` on order details today.

Kitchen / history uses flattened `variation` rows with slot prefixes:

```text
Burger #1 · Doneness: Medium
Burger #2 · Paid Upgrades: Extra Cheese
```

JSON shape example on `order_details.variation`:

```json
[
  {
    "name": "Burger #2 · Paid Upgrades",
    "values": { "label": ["Extra Cheese"] },
    "slot_index": 2,
    "slot_label": "Burger #2"
  }
]
```

**Flutter order history:** parse `details[].variation` (and `variation_kitchen_lines` if present).  
Do not expect `combo_selections` on order detail APIs unless backend adds it later.

---

## 7. How restaurants create the combo (for QA)

Restaurant Panel → Listing Manager → Add/Edit Item → **Variations**:

1. Toggle **Multi-item combo (step-by-step)** ON  
2. **How many items?** e.g. `4`  
3. **Slot label** e.g. `Burger`  
4. Add variation groups **once** (template for each burger)  
5. Save / publish  

Menu API then returns `combo_definition` + `variations` template.

Swagger menu example: **TEST 4-Burger Combo**.

---

## 8. Implementation checklist

### Models
- [ ] Parse nullable `combo_definition` on food / menu models  
- [ ] `FoodComboDefinition.isCombo` helper  
- [ ] Cart line model includes `combo_selections`  

### Product UI
- [ ] Branch: combo UI vs normal modifier UI  
- [ ] N step rows + expand/modal  
- [ ] Independent selection state per slot  
- [ ] Reuse existing variation widgets (`opt_out` / `opt_in` / `standard`)  
- [ ] Done / Next + auto-advance  
- [ ] Green check + summary when complete  
- [ ] Add to Cart disabled until all slots complete  
- [ ] Footer total = base + all slots + add-ons  

### Cart / checkout
- [ ] `POST cart/add` sends `combo_selections`  
- [ ] Top-level variations empty for combo lines  
- [ ] Handle `combo_incomplete` / `combo_slot_incomplete`  
- [ ] Cart list shows per-slot summaries  
- [ ] Place order / quote includes `combo_selections` when using buy-now  

### Order history
- [ ] Display kitchen-prefixed variation lines per burger  

### Regression
- [ ] Non-combo items unchanged  
- [ ] Single Burger Box (no `combo_definition`) still works  

---

## 9. Manual test plan

1. Point app at **dev**: `https://backend-dev.gizra.app/api` (or your env).  
2. Open a restaurant that has a published combo item.  
3. Confirm food JSON has `"combo_definition": { "enabled": true, ... }`.  
4. Open product → see **4 steps**, not one giant modifier list.  
5. Try Add to Cart with 1 burger only → button disabled **or** API `400 combo_incomplete`.  
6. Complete all 4 → Add succeeds; cart line shows combo / slot info.  
7. Place order → restaurant ticket shows `Burger #N · …` lines.  
8. Open a normal (non-combo) item → old UI only.

---

## 10. What backend already guarantees

| Concern | Backend |
|---------|---------|
| Catalog flag + steps | `combo_definition` on menu foods |
| Reject incomplete combo on cart add | Yes (`400` + `code`) |
| Persist `combo_selections` on cart | Yes |
| Price per slot at checkout | Yes |
| Kitchen-readable variation names | Yes (`Burger #2 · Group: option`) |
| Vendor / Restaurant Panel config | Yes |

| Concern | Flutter must do |
|---------|-----------------|
| Step / accordion UX | Yes |
| Client-side disable Add until complete | Yes |
| Build `combo_selections` payload | Yes |
| Per-slot price footer | Yes |
| Cart / order UI summaries | Yes |

---

## 11. Support / questions

- Swagger UI (dev): `https://backend-dev.gizra.app/swagger/` → Customer → Cart / Foods  
- Search schemas: `FoodComboDefinition`, `ComboSlotSelection`  
- Cart add examples: `normalItem`, `fourBurgerCombo`

If anything in the live OpenAPI conflicts with this doc, **prefer OpenAPI + this file**; ask backend to update the other.
