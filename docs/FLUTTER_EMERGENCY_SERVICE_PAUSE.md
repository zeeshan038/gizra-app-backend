# Flutter customer app — Emergency service pause

**Audience:** Flutter developer (paste this file into Cursor for implementation).  
**Backend repo:** `gizra-backend`  
**Last updated:** 2026-11-10  

**Related:** Time-based delivery distance restriction → `FLUTTER_PLACES_AND_DELIVERY_RESTRICTION.md` (Part B). Both features can return **403** on checkout; parse **`code`** separately.

---

## Cursor / AI instructions (copy below into your prompt)

```
Implement admin "Emergency service pause" in the Gizra consumer Flutter app:

1) BANNER — On app launch and when location changes, read emergency_service_pause from
   GET /consumer/config/bootstrap (already called for maintenance/force-update). If active,
   show a persistent security notice using `message`. Refresh after bootstrap refetch or
   zone-id when user moves pin.

2) CHECKOUT — On delivery-fee, order/quote, and order/place, handle HTTP 403 with
   code EMERGENCY_SERVICE_PAUSED (see this doc). Show the same copy as the banner; block
   place order. Do not treat as "restaurant closed".

3) ZONES — Do not hide restaurants/lists when pause is on unless product asks;
   server blocks checkout. Optional: grey-out or badge if user's zone_id is in paused_zone_ids.

Follow the checklist at the end. Swagger: {BASE_URL}/swagger/customer —
Consumer Config (bootstrap, emergency-service-pause, zone-id, delivery-fee) and Consumer Orders (quote/place).
Admin toggles zones in web panel only — not in Flutter.
```

---

## Base URL & auth

| Item | Value |
|------|--------|
| API prefix | `{BASE_URL}/api` e.g. `https://backend-dev.gizra.app/api` |
| Bootstrap / emergency / zone-id | **Public** — no `Authorization` |
| delivery-fee / quote / place | Consumer **Bearer** token (same as today) |

---

## What the admin controls (context only)

Super Admin → **Business settings → Emergency pause**:

- **Pause all zones** — every zone in the database.
- **Zones to pause** — multi-select of `zone_id` from Zone Setup.
- **Customer security notice** — optional text (max 1000 chars); server uses a default if empty.

When pause is active, **new** orders are blocked; **in-progress** orders are unchanged.

---

# Part 1 — Read pause state (banner)

## When to refresh

| Event | API |
|-------|-----|
| App cold start / resume | `GET /consumer/config/bootstrap` |
| Optional lightweight poll | `GET /consumer/config/emergency-service-pause` (same payload as bootstrap field) |
| User changes map pin / address | `GET /consumer/config/zone-id?lat=&lng=` (includes per-pin hint) |

You likely already call **bootstrap** for `maintenance_mode` and force-update. Extend that parser — do not add a second startup call unless you prefer a dedicated refresh endpoint.

### 1.1 App launch — bootstrap

```http
GET /consumer/config/bootstrap
```

**200** — flat JSON. Relevant fields:

```json
{
  "maintenance_mode": false,
  "maintenance_message": null,
  "app_minimum_version_android": "10.0.0",
  "emergency_service_pause": {
    "active": true,
    "pause_all": false,
    "message": "Due to a security situation, ordering is temporarily unavailable in your area.",
    "paused_zone_ids": [8, 9],
    "zones": [
      {
        "zone_id": 9,
        "name": "gush",
        "display_name": "gush etzion",
        "paused": true
      },
      {
        "zone_id": 8,
        "name": "hebron",
        "display_name": "hebron",
        "paused": false
      }
    ]
  }
}
```

| Field | Flutter use |
|-------|-------------|
| `emergency_service_pause.active` | Show global security banner when `true` |
| `emergency_service_pause.message` | Banner title/body (non-null when `active`) |
| `paused_zone_ids` | Compare with cached `zone_id` from zone-id / whoami |
| `zones[]` | Optional UI (which regions are paused) |
| `pause_all` | Informational; when `true`, all zones are in `paused_zone_ids` |

**UX:** Full-width banner below app bar or above home content (high contrast, warning style). Dismiss **not** recommended while `active` is true — admin expects a visible security notice.

### 1.2 Dedicated endpoint (optional)

```http
GET /consumer/config/emergency-service-pause
```

Returns the same object as `emergency_service_pause` on bootstrap (not wrapped in `status/msg`). Use for pull-to-refresh on home without re-fetching full bootstrap.

### 1.3 Zone resolve — pin in paused area

```http
GET /consumer/config/zone-id?lat={lat}&lng={lng}
```

**200** — still returns `zone_id` and `zone_data` as today, plus:

```json
{
  "zone_id": "[9]",
  "zone_data": [ ... ],
  "emergency_service_pause": {
    "active": true,
    "message": "Due to a security situation…",
    "paused_zone_id": 9
  }
}
```

| `emergency_service_pause.active` | Meaning |
|------------------------------------|---------|
| `false` | Pin is not in a paused zone (or no pause globally) |
| `true` | Show banner for this location; `paused_zone_id` may be set |

Use this when the user moves the delivery pin so the banner updates without waiting for the next app launch.

---

# Part 2 — Server enforcement (checkout)

Admin pause is enforced on the server. The app must handle **403** and must not assume checkout works because the UI still shows restaurants.

## Where enforcement happens

| When | API |
|------|-----|
| Address / restaurant change (delivery) | `GET /consumer/config/delivery-fee` |
| Checkout totals | `POST /consumer/order/quote` |
| Place order | `POST /consumer/order/place` |

### Product rules (server-side — mirror in copy)

- **Any order type** (delivery, takeaway, dine-in): blocked if the **restaurant `zone_id`** is paused.
- **Delivery only:** also blocked if the **delivery destination** lies inside a paused zone.
- Coexists with **DELIVERY_DISTANCE_TIME_RESTRICTED** — different `code`; handle both.

### 2.1 Delivery fee

```http
GET /consumer/config/delivery-fee?restaurant_id={id}&destination_lat={lat}&destination_lng={lng}
Authorization: Bearer {token}
```

**403** when emergency pause applies:

```json
{
  "status": false,
  "msg": "Due to a security situation, ordering is temporarily unavailable in your area.",
  "code": "EMERGENCY_SERVICE_PAUSED",
  "description": "Due to a security situation, ordering is temporarily unavailable in your area.",
  "paused_zone_id": 9,
  "restaurant_id": 3
}
```

| Field | UI |
|-------|-----|
| `msg` or `description` | Primary text (prefer `msg`) |
| `paused_zone_id` | Optional debug / support |
| `restaurant_id` | Present on delivery-fee only |

**UX:** Inline alert on checkout; disable place; do **not** say “restaurant closed”. Existing orders / order history unchanged.

### 2.2 Quote & place

Same **`code`: `EMERGENCY_SERVICE_PAUSED`** on **403** for quote and place (delivery and non-delivery blocked when restaurant zone is paused).

```json
{
  "status": false,
  "msg": "Due to a security situation…",
  "code": "EMERGENCY_SERVICE_PAUSED",
  "description": "Due to a security situation…",
  "paused_zone_id": 9
}
```

Always branch on `code`, not only `msg`.

### 2.3 vs delivery distance restriction

| `code` | Meaning |
|--------|---------|
| `EMERGENCY_SERVICE_PAUSED` | Security / regional pause (this doc) |
| `DELIVERY_DISTANCE_TIME_RESTRICTED` | Scheduled km cap for selected restaurants (`FLUTTER_PLACES_AND_DELIVERY_RESTRICTION.md`) |

If both could apply, server returns whichever check runs first — handle each with its own message UI.

### Dart constant

```dart
const kEmergencyServicePaused = 'EMERGENCY_SERVICE_PAUSED';
```

### Suggested parser helper

```dart
bool isEmergencyServicePaused(Map<String, dynamic>? json) =>
    json != null && json['code'] == kEmergencyServicePaused;

String emergencyPauseMessage(Map<String, dynamic> json) =>
    (json['msg'] ?? json['description'] ?? '').toString();
```

---

## Suggested Flutter structure

```text
lib/features/emergency_pause/
  emergency_pause_model.dart      # fromJson bootstrap / public payload
  emergency_pause_controller.dart # Riverpod/Bloc: load bootstrap, expose banner
  emergency_pause_banner.dart     # widget shown on home + checkout

lib/features/checkout/
  checkout_errors.dart            # map 403 codes including EMERGENCY_SERVICE_PAUSED
```

Wire **banner** at:

- Home / tab shell (after bootstrap).
- Checkout screen (repeat if delivery-fee returns 403).

---

## Implementation checklist

### Banner / state

- [ ] Parse `emergency_service_pause` from `GET /consumer/config/bootstrap`.
- [ ] Show persistent banner when `active == true` using `message`.
- [ ] On zone-id after lat/lng change, read `emergency_service_pause` and update banner.
- [ ] Optional: `GET /consumer/config/emergency-service-pause` on pull-to-refresh.
- [ ] Optional: hide/disable checkout CTA when user’s `zone_id` ∈ `paused_zone_ids` (server still enforces).

### Checkout

- [ ] Handle 403 + `EMERGENCY_SERVICE_PAUSED` on **delivery-fee**.
- [ ] Same on **order/quote** and **order/place**.
- [ ] Do not conflate with maintenance mode or restaurant closed.
- [ ] Keep handling `DELIVERY_DISTANCE_TIME_RESTRICTED` separately.

### Regression

- [ ] Pause off: banner hidden; orders work.
- [ ] Pause one zone: delivery to that zone blocked; quote/place return code.
- [ ] Restaurant in paused zone: takeaway also blocked (403).
- [ ] Pause all: bootstrap `active` true; checkout blocked.
- [ ] In-progress order tracking still works.

---

## QA with admin panel

1. Super Admin → **Emergency pause** → select zone(s) → **Save paused zones** (or toggle **Pause all**).
2. Set custom **Customer security notice** and save.
3. Consumer app: restart or refresh bootstrap — banner text should match.
4. Attempt checkout in paused zone — expect 403 + `EMERGENCY_SERVICE_PAUSED`.
5. Turn pause off — banner clears; checkout succeeds.

---

## References

| Resource | Location |
|----------|----------|
| Swagger UI (customer) | `{BASE_URL}/swagger/customer` — **Consumer Config**: `bootstrap`, `emergency-service-pause`, `zone-id`, `delivery-fee` |
| OpenAPI | `gizra-backend/gizra_customer.openapi.json` |
| Backend overview | `gizra-backend/docs/EMERGENCY_SERVICE_PAUSE.md` |
| Delivery km restriction | `gizra-backend/docs/FLUTTER_PLACES_AND_DELIVERY_RESTRICTION.md` |
| Swagger schemas | `EmergencyServicePausePublicPayload`, `EmergencyServicePausedError` |

---

## Out of scope for Flutter

- Admin **GET/PUT** `/admin/emergency-service-pause` — Super Admin web only.
- Creating/editing zones — Zone Setup in admin panel.
- Cancelling existing orders when pause turns on — ops/admin if needed.
