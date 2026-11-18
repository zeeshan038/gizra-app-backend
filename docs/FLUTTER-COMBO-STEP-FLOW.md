# Flutter — multi-slot combo step flow (e.g. 4-Burger Combo)

Backend support for step-by-step / accordion combo configuration.

Related: [FLUTTER-MENU-VARIATIONS-INTEGRATION.md](./FLUTTER-MENU-VARIATIONS-INTEGRATION.md), [FLUTTER-CART-IMPLEMENTATION.md](./FLUTTER-CART-IMPLEMENTATION.md).

---

## 1. When to use this UI

Menu food objects may include:

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

If `combo_definition` is `null` / missing → keep the existing single-product modifier screen.

If present and `enabled` → show **grouped steps** (accordion or modal per slot).

**Modifier template:** `food.variations` is the template for **every** slot (same doneness / toppings / upgrades groups). Do **not** duplicate groups in the catalog.

---

## 2. Product screen UX

1. Show collapsed rows: Burger #1 … Burger #N (from `slot_labels` / `steps`).
2. Tap a row → open modal / expand accordion with the same variation UI as a normal burger (`selectionMode` opt_out / opt_in / standard).
3. On **Done / Next**:
   - Mark slot complete (checkmark + short summary of picks).
   - Auto-open the next incomplete slot.
4. **Add to cart** enabled only when all `slot_count` slots are complete (client-side). Server also rejects incomplete combos.

---

## 3. Cart payload

`POST /api/consumer/cart/add` (and buy-now / place-order line items):

```json
{
  "restaurant_id": 3,
  "item_id": 102,
  "item_type": "Food",
  "price": 120,
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
        {
          "name": "Ingredients to Remove",
          "values": { "label": ["Onion"] }
        },
        {
          "name": "Paid Upgrades",
          "values": { "label": ["Extra Cheese"] }
        }
      ]
    },
    {
      "slot_index": 2,
      "slot_label": "Burger #2",
      "variation_options": [ ... ]
    }
  ]
}
```

Notes:

- Prefer `variation_options` (or `variations`) **inside each slot** — same group shape as today.
- Top-level `variations` / `variation_options` may be empty for combo lines.
- `price` = unit total: `food.price + sum(extras for all slots) + add-ons`.
- Incomplete combo → `400` with `code: combo_incomplete` or `combo_slot_incomplete`.

Cart GET returns `combo_selections` on each line.

---

## 4. Pricing

```
unit = food.price
     + Σ slots computeVariationExtra(template, slot.picks)
     + add_ons
```

Charge each slot independently (same group name may appear on every burger).

---

## 5. Restaurant Panel setup

Listing Manager → Add/Edit Item → **Variations** tab:

1. Toggle **Multi-item combo (step-by-step)**.
2. Set slot count (e.g. 4) and label (e.g. `Burger`).
3. Configure variation groups once (template for each slot).
4. Save.

---

## 6. Kitchen / order ticket

Order detail `variation` JSON stores flat rows with prefixed names, e.g.:

`Burger #2 · Ingredients to Remove: Onion`

Restaurant panel order UI already renders these lines.

---

## 7. Flutter checklist

- [ ] Parse `combo_definition` on food models.
- [ ] Step / accordion UI when `combo_definition.enabled`.
- [ ] Local validation: all slots complete before Add.
- [ ] Send `combo_selections` on cart add / place order.
- [ ] Cart line display: show per-slot summaries.
- [ ] Footer total uses per-slot extras + base.

---

## 8. Swagger / OpenAPI

Regenerated with `npm run swagger:gen`. Look for:

- Schema `FoodComboDefinition`, `ComboSlotSelection`, `ConsumerCartAddBody`
- Menu example **TEST 4-Burger Combo** (`combo_definition.enabled`)
- `POST /consumer/cart/add` examples: `normalItem` + `fourBurgerCombo`
- Cart line field `combo_selections`
- Place-order line item field `combo_selections`

Customer codegen file: `gizra_customer.openapi.json` / `swagger-customer.json`.
