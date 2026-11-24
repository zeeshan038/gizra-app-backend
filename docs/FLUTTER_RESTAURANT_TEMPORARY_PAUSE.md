# Restaurant Temporary Pause / Early Close — Flutter & POS Integration

Backend feature for **timed** restaurant pauses without changing weekly hours or indefinite `active` toggle.

**Base URL:** `{API_HOST}/api`  
**Vendor auth:** `Authorization: Bearer <vendor JWT>` (`POST /vendor/login`)  
**Consumer:** existing restaurant list/detail fields; optional Socket.IO watch

HTTP availability remains the **source of truth**. Socket events are hints to refetch.

---

## Concepts

| Mechanism | Field(s) | Meaning |
|-----------|----------|---------|
| Indefinite close (existing) | `restaurants.active = false` | Vendor `PUT /vendor/restaurant/active-status` `{ "closed": true }` |
| Timed pause (new) | `paused_until`, `pause_type`, `pause_message` | Expiry calculated **only on the server** |
| Admin kill switch | `restaurants.status` | Unchanged |
| Weekly hours | `restaurant_schedule` | Unchanged |

**Pause types**

| `pause_type` | Behaviour |
|--------------|-----------|
| `PAUSE_30` | Closed until `now + 30 minutes` |
| `PAUSE_60` | Closed until `now + 60 minutes` |
| `EARLY_CLOSE` | Closed until end of **current** operating shift (overnight-aware). Fails if not currently in a shift. |

Expired `paused_until` is ignored automatically (no cron). Customer payloads omit expired pause fields.

Effective temporary close:

```
active === false  OR  (paused_until != null AND paused_until > now)
```

---

## Vendor / POS APIs

All under `/api/vendor/restaurant/*` with vendor JWT. Ownership comes from JWT restaurant context.

### Apply pause

`POST /vendor/restaurant/temporary-pause`

```json
{
  "pause_type": "PAUSE_30",
  "message": "Kitchen is slammed — back in 30 minutes",
  "message_preset": "busy"
}
```

- `pause_type` **required**: `EARLY_CLOSE` | `PAUSE_30` | `PAUSE_60`
- `message` optional, max 255 chars (wins over preset)
- `message_preset` optional: `busy` | `break` | `early_close` | `kitchen`

**200**

```json
{
  "status": true,
  "msg": "Temporary pause applied",
  "data": {
    "is_paused": true,
    "pause_type": "PAUSE_30",
    "paused_until": "2024-06-12T14:30:00+03:00",
    "pause_message": "Kitchen is slammed — back in 30 minutes",
    "active": true,
    "availability": {
      "status": "CLOSED",
      "can_order": false,
      "open": false,
      "next_open_at": "2024-06-12T14:30:00+03:00",
      "next_close_at": null,
      "is_temporarily_closed": true,
      "paused_until": "2024-06-12T14:30:00+03:00",
      "pause_message": "Kitchen is slammed — back in 30 minutes",
      "pause_type": "PAUSE_30"
    }
  }
}
```

**400** — invalid type / early-close outside an active shift  
**403** — no restaurant context  
**404** — restaurant missing  

Do **not** send `paused_until` from the client.

### Get current pause

`GET /vendor/restaurant/temporary-pause`

Returns the same `data` shape plus `message_presets` map for UI chips.

Also mirrored on `GET /vendor/restaurant/business-setup` as `data.temporary_pause`.

### Cancel pause

`DELETE /vendor/restaurant/temporary-pause`

Clears `paused_until` / `pause_message` / `pause_type` only.  
**Does not** change `active` or admin `status`.

---

## Customer app

### Response fields (lists + detail)

Existing helpers now include (additive):

| Field | Type | Notes |
|-------|------|-------|
| `can_order` / `open` | bool | Block checkout when false |
| `is_temporarily_closed` | bool | True for indefinite `active` or active timed pause |
| `status` | enum | `OPEN` \| `CLOSES_SOON` \| `CLOSED` \| `OPENS_SOON` |
| `next_open_at` / `next_close_at` | string\|null | Business timezone ISO with offset |
| `paused_until` | string\|null | **Only while timed pause active** |
| `pause_message` | string\|null | Show banner when present |
| `pause_type` | string\|null | Optional analytics / copy |

Older apps that only read `can_order` / `open` / `is_temporarily_closed` keep working.

### Order / checkout

Instant quote / place / payment-link dry-run / complete-checkout-payment:

- Closed → **403**, `code: "order_time"`, `msg: "Restaurant is closed"`
- May include `is_temporarily_closed`, `paused_until`, `pause_message`, `pause_type`

Scheduled orders (`schedule_at`):

- Rejected if `schedule_at` is **before** active `paused_until` (same `order_time` code)
- Allowed if scheduled **after** the pause ends (and other schedule rules pass)
- Indefinite `active=false` scheduled behaviour unchanged

Existing accepted orders are **not** cancelled.

Payment race: if the restaurant pauses after payment-link creation, `complete-checkout-payment` / place may fail with `order_time`. Existing payment reconciliation / attach flows are unchanged — treat like “closed during hours” today.

Emergency Service Pause and Delivery Distance-Time Restriction are independent and still apply.

---

## Socket.IO

Event: `restaurant_availability_changed`

Room: `restaurant_availability:{restaurantId}`  
(Vendors auto-join on connect. Customers must opt in — they never join `restaurant:{id}`, so they never receive `new_order`.)

### Customer / vendor subscribe

```
emit('watch_restaurant', { restaurant_id: 12 }, (ack) => { ... })
emit('unwatch_restaurant', { restaurant_id: 12 })
```

### Payload

```json
{
  "restaurant_id": 12,
  "status": "CLOSED",
  "can_order": false,
  "open": false,
  "next_open_at": "2024-06-12T14:30:00+03:00",
  "next_close_at": null,
  "is_temporarily_closed": true,
  "paused_until": "2024-06-12T14:30:00+03:00",
  "pause_message": "Taking a short break. Back soon!",
  "pause_type": "PAUSE_30",
  "updated_at": "2024-06-12T14:00:05.123Z"
}
```

Emitted when timed pause is applied/cancelled and when indefinite `active-status` changes.  
On receive: update UI banner and/or refetch restaurant detail.

---

## POS UX suggestions

1. Three actions: Pause 30 / Pause 60 / Close for rest of shift  
2. Optional reason chips (`busy`, `break`, `early_close`, `kitchen`) or free text  
3. Show countdown from `paused_until`  
4. “Resume ordering” → `DELETE /temporary-pause`  
5. Keep existing open/closed toggle for indefinite close (`active-status`)  
6. Listen for `restaurant_availability_changed` to sync multi-device POS  

---

## Migration

```
prisma/migrations/20261125003000_restaurant_temporary_pause/migration.sql
```

Adds nullable `paused_until`, `pause_message`, `pause_type` on `restaurants`. Existing rows unchanged.
