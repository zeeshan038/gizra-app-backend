# Frontend handoff — Driver app, POS / vendor orders

This document describes **new and updated** backend APIs for:

- **Gizra Driver** (Flutter / mobile) — wallet, withdraw, earnings, orders, cooking time
- **Restaurant / POS** (vendor JWT) — assigned driver on order detail, cooking time when starting kitchen

**Base URL:** `{API_HOST}/api`  
**Swagger (recommended):**

| App | URL (on backend) | Spec file |
|-----|------------------|-----------|
| Driver | `/swagger/driver` | `swagger-driver.json` |
| Vendor / POS | `/swagger/vendor` | `swagger-vendor.json` |

**Auth:** `Authorization: Bearer <JWT>` unless noted.

**Common envelope:**

```json
{ "status": true, "msg": "Success", "data": { ... } }
```

Errors: `{ "status": false, "msg": "..." }` (HTTP 4xx/5xx).

Regenerate specs after backend pull: `npm run swagger:gen` in `gizra-backend`.

---

## 1. Driver — order history & active jobs

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/delivery-man/orders/history` | Completed / past deliveries (paginated) |
| GET | `/delivery-man/orders/active` | Current assigned jobs |
| GET | `/delivery-man/orders/latest` | Pool / claimable orders |
| GET | `/delivery-man/orders/:id` | Order detail (request + active delivery screens) |
| PUT | `/delivery-man/orders/:id/accept` | Accept unassigned order |
| PUT | `/delivery-man/orders/:id/status` | Update status (`picked_up`, `delivered`, etc.) |

Query params for list endpoints follow existing driver Swagger (`limit`, `offset` / `page`, `search` where documented).

---

## 2. Driver — earnings & per-order payment history

**GET** `/delivery-man/earnings`

| Query | Description |
|-------|-------------|
| `limit`, `offset` or `page` | Pagination (default limit 15) |
| `search` | Filter by order id |
| `summary_only=true` | Only wallet + period totals, no `history` array |

**`data.summary.wallet`**

| Field | Meaning |
|-------|---------|
| `total_earning` | Lifetime credited to wallet |
| `total_withdrawn` | Already paid out (approved withdraws) |
| `pending_withdraw` | Locked in pending withdraw requests |
| `collected_cash` | COD cash still held — reduces withdrawable |
| `balance` | `total_earning - total_withdrawn` |
| `withdrawable_balance` | Max amount driver can **request** now |

**Period totals:** `todays_earning`, `this_week_earning`, `this_month_earning`, `lifetime_earning`.

**`data.history[]`** — earning rows with linked **order + line items** (see Swagger example). Sources: `order_transaction` or fallback `delivered_order`.

Use this screen for **“how much I earned per delivery”**, not for bank withdraw (use **Wallet** below).

---

## 3. Driver — wallet, withdraw, cash payment history

### 3.1 Wallet screen (single call)

**GET** `/delivery-man/wallet`

Query: `limit`, `offset` (1-based page), optional `search`.

**`data`**

| Field | Purpose |
|-------|---------|
| `wallet` | Same balance fields as earnings (`withdrawable_balance`, etc.) |
| `withdrawal_methods` | Admin-defined templates (bank fields) |
| `withdraw_requests` | Driver’s withdraw history + pending |
| `withdraw_total_size` | Total count for pagination |
| `payment_history` | COD / cash settlements to admin (`account_transactions`) |
| `payment_total_size` | Total count for pagination |

**Withdraw request item**

| Field | Notes |
|-------|--------|
| `id` | Request id |
| `amount` | Requested amount |
| `status` | `Pending` \| `Approved` \| `Denied` |
| `method` | Method display name |
| `request_time` | ISO datetime |
| `can_cancel` | `true` only while pending |

### 3.2 Withdraw flow (step by step)

1. **Show balance** — `GET /delivery-man/wallet` or `GET /delivery-man/earnings?summary_only=true` → use `withdrawable_balance`.
2. **Load methods** — `GET /delivery-man/wallet/withdraw-method-options`  
   Each method: `id`, `method_name`, `method_fields[]` with `input_name`, `input_type`, `placeholder`, `is_required`.
3. **Submit request** — **POST** `/delivery-man/wallet/withdraw-request`

```json
{
  "amount": 150,
  "id": 1,
  "account_name": "Driver Name",
  "account_number": "123456789"
}
```

- `amount` — number, must be ≤ `withdrawable_balance`
- `id` — `withdrawal_methods.id` (not a saved account id)
- **Additional keys** — must match each method’s `input_name` from step 2 (same pattern as restaurant vendor wallet)

Success: `{ "status": true, "msg": "Withdraw request placed successfully" }`  
Insufficient balance: HTTP **403** with message including max withdrawable.

4. **Cancel pending** — **DELETE** `/delivery-man/wallet/withdraw-request/:id`  
   Only when `can_cancel === true`.

### 3.3 After submit (admin — not driver UI)

Request is stored with `delivery_man_id`, `approved = 0` (pending). Admin must **approve or deny** (restaurant withdraw UI exists on admin; **driver withdraw approval** may still be handled in admin/disbursement — confirm with backend team before building “paid out” UX).

Driver should show **Pending** until admin approves; then status becomes **Approved** / **Denied** on next `GET /wallet`.

### 3.4 Payment history

**`payment_history`** on `GET /wallet` — legacy parity with PHP `wallet-payment-list` (collected cash payments). Display as a separate list from **withdraw_requests**.

---

## 4. Driver — cooking time (from POS)

When restaurant/POS moves order to **cooking** (`processing`), assigned drivers get data on order APIs and push.

**On order detail / list** (when status is `processing` or later):

| Field | Type | Description |
|-------|------|-------------|
| `processing_time` | string \| null | Minutes as stored by POS (e.g. `"25"`) |
| `cooking_time_minutes` | number \| null | Parsed minutes |
| `processing_started_at` | ISO datetime \| null | When kitchen started |
| `cooking_ready_by` | ISO datetime \| null | Estimated ready time |
| `cooking_minutes_remaining` | number \| null | Live countdown (only while `order_status === "processing"`) |

Cooking fields are **null** when status is not `processing` (avoid showing a stale “15 min” after food is ready). Prefer **`cooking_minutes_remaining`** for the driver UI countdown, not a hardcoded value.

**FCM** (assigned driver only, on `processing`):

- Notification body e.g. “Restaurant started cooking — ready in about 25 min”
- Data payload may include: `processing_time`, `cooking_time_minutes`, `order_id`, `order_status`, `type`

**Socket** `order_status_changed` payload includes the same cooking fields when backend emits status updates.

---

## 5. Vendor / POS — assigned driver on order detail

**GET** `/vendor/orders/:id` (restaurant + POS share vendor JWT)

**New / updated fields on `data`:**

| Field | When |
|-------|------|
| `delivery_man_id` | Driver accepted the job |
| `delivery_man_name`, `delivery_man_phone` | Assigned driver |
| `delivery_man` | `{ id, name, phone, email, image_url }` |
| `driver_accepted_at` | ISO datetime when driver accepted |
| `notified_delivery_men` | Manual dispatch, **no** driver yet — list of drivers notified |
| `zone_name` | Zone label for dispatch messaging |
| `processing_time`, `cooking_time_minutes`, `processing_started_at`, `cooking_ready_by` | After POS starts cooking |

**UI suggestion:** Sidebar or block “Assigned driver” (name, phone, accepted time). If manual dispatch and no driver, show waiting + optional notified count.

---

## 6. POS — Request Gizra ride + restaurant order number

When the restaurant uses **Request Gizra ride** (manual dispatch), they can send their **own ticket/receipt id** from an existing POS so drivers can match the job to the counter.

**POST** `/vendor/dispatch/request-driver`

Add optional field (any one name is accepted):

| Body field | Notes |
|------------|--------|
| `restaurant_order_ref` | **Preferred** — max 100 chars |
| `restaurant_order_number`, `pos_order_number`, `pos_order_id`, `external_order_id` | Aliases |

Example:

```json
{
  "customer_name": "Yossi Cohen",
  "customer_phone": "+972501234567",
  "address": "12 Herzl St",
  "order_amount": 85,
  "delivery_fee": 25,
  "payment_method": "cash_on_delivery",
  "idempotency_key": "pos-dispatch-2026-04-05-001",
  "restaurant_order_ref": "4521"
}
```

**Driver list/detail** (`GET /delivery-man/orders/latest`, `/active`, `/:id`) include:

| Field | Meaning |
|-------|---------|
| `order_source` | `manual_dispatch` = Gizra ride from restaurant; `gizra_consumer` = customer app order |
| `order_source_label` | Human-readable badge text |
| `gizra_order_id` | Platform id (`orders.id`) |
| `restaurant_order_ref` | Restaurant’s number when provided |
| `display_order_number` | Show **`restaurant_order_ref`** if set, else **`gizra_order_id`** |
| `is_manual_dispatch` | Same as `order_source === manual_dispatch` |

Socket **`order_request`** payload includes the same identity fields so the request tab can show a badge without refetching.

**Deploy:** run SQL `scripts/sql/add-restaurant-order-ref.sql` on the database before enabling the new backend build.

---

## 7. Vendor / POS — start cooking with time

**PUT** `/vendor/orders/:id/status`

```json
{
  "status": "processing",
  "processing_time": "25"
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `status` | yes | Use `"processing"` for “Proceed for cooking” |
| `processing_time` | **required** when `status` is `processing` | Minutes until food ready (1–999). Aliases accepted: `processingTime`, `cooking_time`, `cooking_time_minutes`. **Do not omit** — backend no longer defaults from restaurant delivery time (that caused every order to show e.g. 15 min). |

**PUT** `/vendor/orders/:id/cooking-time` — change minutes while status is already `processing` (resets timer from now). Same body keys as above.

Other statuses unchanged (`confirmed`, `handover`, `picked_up`, `delivered`, `canceled`, …).

Restaurant **web panel** already prompts for minutes on “Proceed For Cooking”; **POS app** should send the same body.

---

## 8. Admin panel (reference)

**GET** `/admin/orders/:orderId` — same driver fields as vendor detail (`delivery_man_*`, `driver_accepted_at`, etc.) for support screens.

---

## 9. Quick integration checklist

### Driver app

- [ ] Wallet tab → `GET /delivery-man/wallet`
- [ ] Withdraw → methods → POST withdraw → list/cancel on wallet
- [ ] Earnings tab → `GET /delivery-man/earnings`
- [ ] Order history → `GET /delivery-man/orders/history`
- [ ] Active job UI → show cooking timer fields when present
- [ ] Handle FCM data keys for cooking + existing order status

### POS / restaurant

- [ ] Order detail → show assigned driver from `GET /vendor/orders/:id`
- [ ] Cooking action → `PUT .../status` with `processing` + `processing_time`
- [ ] Optional: poll or socket for driver assignment updates
- [ ] Request Gizra ride form → optional `restaurant_order_ref` on `POST /vendor/dispatch/request-driver`

### Driver app (order source)

- [ ] Request cards: badge from `order_source_label`; show `display_order_number` + small “Gizra #…” when ref is set

---

## 10. Questions / gaps

Contact backend if you need:

- Admin API + UI to **approve/deny driver withdraw** requests (requests are created; admin flow may still mirror restaurant withdraw).
- Driver **saved payout accounts** (disbursement methods) — legacy PHP only; current flow uses **one-off** method fields on each withdraw request like vendor wallet.

**Swagger tag:** Driver wallet routes are under **“Delivery Man Wallet”** in `/swagger/driver`.
