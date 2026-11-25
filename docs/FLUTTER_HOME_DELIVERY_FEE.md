# Flutter customer app — home screen delivery fee

**Audience:** Flutter developer (paste this file into Cursor for implementation).  
**Backend repo:** `gizra-backend`  
**Related docs:** `FLUTTER_PLACES_AND_DELIVERY_RESTRICTION.md`, `CONSUMER_PLACES_API.md`  
**Last updated:** 2026-11-25  

---

## Cursor / AI instructions (copy below into your prompt)

```
Implement home-screen delivery fee display in the Gizra consumer Flutter app.

Product goal: show the delivery price on restaurant cards on the home screen
(and keep the same fee when opening a restaurant menu), consistent with checkout.

Rules:
1) Reuse the same server fee logic / response fields as GET /consumer/config/delivery-fee.
2) Do NOT call GET /consumer/config/delivery-fee once per restaurant card on the home list.
3) Use the batch/list delivery-fee endpoint described in FLUTTER_HOME_DELIVERY_FEE.md
   (or fees embedded on restaurant list responses once backend ships that option).
4) Use GPS / saved delivery pin on launch; session-cache fees; recalculate when address changes.
5) Checkout remains authoritative via delivery-fee + order/quote + place (existing flows).

Follow the checklist at the end of FLUTTER_HOME_DELIVERY_FEE.md.
```

---

## Overview

### Product requirement

Customers should see an estimated **delivery fee** on home-screen restaurant cards (and consistently on the restaurant menu header), based on:

1. The customer’s current delivery location (GPS on launch, or saved / selected address pin).
2. The restaurant origin coordinates.
3. The same tiered pricing rules used at checkout (base fee + extra km, free delivery, etc.).

### What exists today (backend)

| Piece | Status |
|-------|--------|
| Single-restaurant quote | **Exists:** `GET /api/consumer/config/delivery-fee` |
| Distance for fees | **Road / driving** via Google Routes (`DRIVE`), Redis-cached ~30 min server-side |
| Checkout | Server recomputes fee on `POST /consumer/order/quote` and `POST /consumer/order/place` |
| Home / list restaurant cards | Return `delivery_time`, open/availability, optional Haversine `distance` — **no `delivery_fee`** |
| Batch / multi-restaurant fee quote | **Exists:** `POST /api/consumer/config/delivery-fee/batch` |
| Flutter app in this repo | Docs only — implement against live API |

### Why not call the existing API per card

`GET /consumer/config/delivery-fee` is correct for **one** restaurant (checkout, menu after navigate, dispatch).

Calling it once per home card means:

- **N HTTP requests** for N visible restaurants.
- **N driving-distance resolutions** (Google Routes) until Redis warms — slow, costly, rate-limit risk.
- Race conditions / partial UI (some cards priced, some not).
- Harder to keep list scroll smooth.

**Recommendation:** one **batch** request (or fees embedded in the list response) that reuses the same quote logic server-side.

---

## Recommended approach

### Preferred: batch delivery-fee endpoint

After home restaurant IDs are known (from popular / nearby / category lists), call **one** batch quote with:

- customer `destination_lat` / `destination_lng`
- list of `restaurant_ids` currently on screen (or the page of IDs you just loaded)

Backend should:

1. Resolve driving distance per restaurant → destination (reuse `resolveDeliveryDistanceKm` / Redis).
2. Run the same fee formula as `quoteDeliveryFeeForDestination`.
3. Return a map/list of fees keyed by `restaurant_id`.

Flutter merges fees into card models by `id`.

### Acceptable alternative: embed fees on list APIs

If product prefers fewer round-trips, backend may add optional query params to existing list endpoints, e.g.:

```http
GET /consumer/restaurants/popular?zone_id=...&latitude=...&longitude=...&include_delivery_fee=1
```

Each restaurant object then includes `delivery_fee` (and related fields).  
Still **one** backend request for the list page — do not fan out to single-fee GET.

### Do not

- Call `GET /consumer/config/delivery-fee` in a loop for home cards.
- Invent client-side fee math (Haversine × per-km) — it will disagree with checkout.
- Use list-card Haversine `distance` to compute a fee locally.
- Hide restaurants when a fee is missing or restricted — show fee when available; handle restriction UX without “closed”.

### When single-restaurant GET is still correct

| Screen | API |
|--------|-----|
| Checkout / cart totals | Existing `GET .../delivery-fee` + `POST .../order/quote` |
| One restaurant after deep link / menu refresh | Single GET **or** take fee from batch cache for that id |
| Vendor/admin dispatch | Existing dispatch delivery-fee routes (out of scope for customer home) |

---

## Existing single-restaurant API (reference — reuse field names)

Keep Flutter models aligned with this response so batch results feel identical.

```http
GET /api/consumer/config/delivery-fee?restaurant_id={id}&destination_lat={lat}&destination_lng={lng}
```

**Auth:** Public today on config router (Bearer optional). Prefer sending the same consumer Bearer as other authenticated calls if your client always attaches it.

### Query parameters

| Param | Required | Description |
|-------|----------|-------------|
| `restaurant_id` | yes | Restaurant id |
| `destination_lat` | yes | Customer delivery latitude |
| `destination_lng` | yes | Customer delivery longitude |
| `distance_km` | no | Present in schema historically; **do not rely on it** — server resolves driving distance |

### Success `200`

```json
{
  "restaurant_id": 3,
  "distance_km": 4.2,
  "distance_source": "google",
  "delivery_fee": 9.4,
  "original_delivery_fee": 9.4,
  "pricing": {
    "base_fee": 5,
    "base_distance_km": 2,
    "extra_per_km": 2,
    "extra_km": 2.2,
    "subtotal_before_surge": 9.4,
    "surge_percent": 0
  }
}
```

| Field | Flutter use |
|-------|-------------|
| `delivery_fee` | **Primary label on the card** (what customer pays for delivery) |
| `original_delivery_fee` | Optional strikethrough when free delivery zeroes the fee |
| `distance_km` | Optional subtitle; do not use for client fee math |
| `distance_source` | `google` \| `cache` — debug / analytics only |
| `pricing` | Optional breakdown sheet; not required on home cards |

### Error shapes (same codes as checkout)

**403** — time-based restriction or emergency pause (examples):

```json
{
  "status": false,
  "msg": "…",
  "code": "DELIVERY_DISTANCE_TIME_RESTRICTED",
  "description": "…",
  "max_distance_km": 10,
  "restriction_end_time": "20:30",
  "timezone": "Asia/Jerusalem",
  "restaurant_id": 3,
  "distance_km": 14.02,
  "distance_source": "google"
}
```

```json
{
  "status": false,
  "msg": "…",
  "code": "EMERGENCY_SERVICE_PAUSED",
  "paused_zone_id": 9,
  "restaurant_id": 3
}
```

**Distance unavailable** (retryable) — treat like checkout:

```json
{
  "status": false,
  "msg": "…",
  "code": "DELIVERY_DISTANCE_UNAVAILABLE",
  "retryable": true,
  "restaurant_id": 3
}
```

Constants:

```dart
const kDeliveryDistanceTimeRestricted = 'DELIVERY_DISTANCE_TIME_RESTRICTED';
const kEmergencyServicePaused = 'EMERGENCY_SERVICE_PAUSED';
const kDeliveryDistanceUnavailable = 'DELIVERY_DISTANCE_UNAVAILABLE';
```

Full checkout UX for restrictions: see `FLUTTER_PLACES_AND_DELIVERY_RESTRICTION.md` Part B.  
On the **home list**, prefer: show card normally; fee chip may show “—” / “Unavailable” / omit fee rather than marking the restaurant closed.

---

## Batch API (implemented)

> **Status:** Live — `POST /api/consumer/config/delivery-fee/batch`  
> Swagger: `{BASE_URL}/swagger/customer` → **Consumer Config** → `postConsumerConfigDeliveryFeeBatch`

### Dedicated batch quote

```http
POST /api/consumer/config/delivery-fee/batch
Content-Type: application/json
```

**Request body:**

```json
{
  "destination_lat": 32.0853,
  "destination_lng": 34.7818,
  "restaurant_ids": [3, 7, 12, 19]
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `destination_lat` | yes | Same pin as zone / address |
| `destination_lng` | yes | Same pin as zone / address |
| `restaurant_ids` | yes | Unique positive ints; cap TBD (suggest ≤ 50, match list page size) |

**Success `200` (suggested):**

```json
{
  "destination_lat": 32.0853,
  "destination_lng": 34.7818,
  "quotes": [
    {
      "restaurant_id": 3,
      "ok": true,
      "distance_km": 4.2,
      "distance_source": "cache",
      "delivery_fee": 9.4,
      "original_delivery_fee": 9.4,
      "pricing": {
        "base_fee": 5,
        "base_distance_km": 2,
        "extra_per_km": 2,
        "extra_km": 2.2,
        "subtotal_before_surge": 9.4,
        "surge_percent": 0
      }
    },
    {
      "restaurant_id": 7,
      "ok": false,
      "code": "DELIVERY_DISTANCE_TIME_RESTRICTED",
      "msg": "…",
      "max_distance_km": 10,
      "restriction_end_time": "20:30",
      "timezone": "Asia/Jerusalem",
      "distance_km": 14.02
    }
  ]
}
```

**Rules for Flutter:**

- Merge by `restaurant_id` → `id` on the card (ids may be string on list APIs — normalize to int/string consistently).
- Partial success is OK: some `ok: true`, some `ok: false`.
- Do not block the whole home feed if one restaurant fails.
- Field names for successful quotes must match the single GET so one Dart model works for both.

### Option B — GET with repeated ids (only if backend prefers GET)

```http
GET /api/consumer/config/delivery-fee/batch?destination_lat=…&destination_lng=…&restaurant_ids=3,7,12,19
```

Same response body as Option A. Prefer **POST** if id lists grow (URL length).

### Option C — embed on list responses

Each restaurant in `popular` / `nearby` / `categories/:id/restaurants` gains:

```json
{
  "id": "3",
  "name": "…",
  "delivery_time": "30-45-min",
  "delivery_fee": 9.4,
  "original_delivery_fee": 9.4,
  "delivery_fee_status": "ok",
  "distance": 3.1,
  "distance_text": "3.1 km",
  "open": true
}
```

Notes:

- List `distance` today is **straight-line** for ranking/badge — **not** the fee distance.
- If both exist, show **fee** from `delivery_fee`; keep Haversine `distance` as optional “as crow flies” only if product wants it (usually hide to avoid confusion).

---

## Location / GPS on launch (prerequisite)

Fees are meaningless without a destination pin.

### Recommended launch flow

```
App open
  → request location permission (or use last saved delivery address)
  → GET /consumer/config/zone-id?lat=&lng=
  → load home lists with zone_id (+ lat/lng for ranking)
  → POST delivery-fee/batch with same lat/lng + visible restaurant_ids
  → paint fee chips
```

| Step | API / source |
|------|----------------|
| Zone | `GET /consumer/config/zone-id?lat=&lng=` |
| Lists | `GET /consumer/restaurants/popular`, `/nearby`, `/categories/...`, etc. |
| Fees | Batch endpoint (or `include_delivery_fee` on lists) |

Also call zone-id when the user **changes** delivery address / map pin (same as Places brief).

If location is denied and no saved address: show cards **without** fee (or “Set delivery address”), do not spam fee APIs with `0,0`.

---

## Flutter implementation — home restaurant cards

### Suggested modules

```text
lib/features/home/
  home_restaurants_controller.dart   # loads lists + triggers fee batch
  restaurant_card.dart               # shows delivery_fee chip
lib/features/delivery_fee/
  delivery_fee_models.dart           # DeliveryFeeQuote (shared)
  delivery_fee_repository.dart       # single + batch
  delivery_fee_session_cache.dart    # in-memory / session cache
```

### Card UI

Current list fields (unchanged): `name`, logo/cover, `delivery_time`, `open` / availability, optional `distance`.

**Add:**

- Fee chip, e.g. `₪9.40` or `Free` when `delivery_fee == 0` and `original_delivery_fee > 0`.
- Loading: subtle placeholder on the fee area while batch is in flight (do not block whole card).
- Missing fee: omit chip or show “—” — still allow open restaurant.
- Restricted (`ok: false` + restriction code): optional small “Limited delivery” affordance; **do not** set status to closed.

Keep **ETA** as existing `delivery_time` string (not derived from Routes).

### Merge algorithm

1. Load restaurants → UI with fee unset.
2. Collect page `ids`.
3. `batchQuote(destLat, destLng, ids)`.
4. For each quote with `ok: true`, set `card.deliveryFee = quote.delivery_fee`.
5. Store in session cache keyed by destination + restaurant id.

### Restaurant menu / detail

When opening `GET /consumer/restaurants/specific/:id`:

1. Prefer session-cache fee for `(destination, restaurantId)`.
2. If miss: **single** `GET /consumer/config/delivery-fee` (one call is fine) **or** batch with `[id]`.
3. Show same chip in the menu header so home → menu → checkout stay consistent.

### Checkout consistency

- Do **not** trust home fee as final charge without refresh.
- On checkout: keep calling existing `GET .../delivery-fee` and `POST .../order/quote`.
- Server remains authoritative on place; client fee is display/advisory.

---

## Error handling

| Situation | Home UI | Menu / checkout |
|-----------|---------|-----------------|
| Batch HTTP 5xx / network | Cards without fee; retry on pull-to-refresh | Retry |
| One restaurant `ok: false` + time restriction | Card stays open; fee omitted or “Limited” | Banner + pickup / closer address (`FLUTTER_PLACES…`) |
| `EMERGENCY_SERVICE_PAUSED` | Follow emergency pause banner docs; fees may fail | Same |
| `DELIVERY_DISTANCE_UNAVAILABLE` + `retryable` | Omit fee; retry later | Block place until retry succeeds |
| No destination | No fee requests | Prompt for address |
| Restaurant does not deliver / 403 generic | Omit fee | Existing messaging |

Parse `code` when present; do not rely only on `msg`.

---

## Caching considerations

### Server (already)

Driving km cached in Redis (~30 minutes) per rounded origin/destination. Quote and place share this — good for consistency; Flutter does not need to send `distance_km`.

### Client session cache (implement in Flutter)

Cache successful quotes for the **current session** (and optionally short TTL, e.g. 10–30 minutes):

**Key suggestion:**

```text
delivery_fee:{destLatRounded}:{destLngRounded}:{restaurantId}
```

Round lat/lng to ~5 decimals (same idea as server cache) so tiny GPS jitter does not thrash.

**Invalidate / recalculate when:**

- User changes delivery address or map pin.
- User switches zone / “deliver here”.
- Pull-to-refresh home (optional soft refresh).
- App returns from background after TTL expiry (optional).

**Do not persist forever** across days without revalidation — prices and restrictions can change.

### Batch + pagination

- Quote **only visible / current page** ids (e.g. 20), not every restaurant in the zone.
- On scroll load-more: batch the **new** ids only; merge into cache.
- Deduplicate ids already cached for the same destination.

---

## Existing home / list endpoints (context)

Fees are **not** on these responses today unless Option C ships:

| Endpoint | Typical home use |
|----------|------------------|
| `GET /consumer/restaurants/popular` | Popular row |
| `GET /consumer/restaurants/nearby` | Nearby (lat/lng required) |
| `GET /consumer/restaurants/all` | Browse all |
| `GET /consumer/categories` + `GET /consumer/categories/:id/restaurants` | “What’s on your mind” |
| `GET /consumer/home-slider` | Banners (no fees) |
| `GET /consumer/restaurants/specific/:id` | Menu — no fee today |

All list/discover flows need `zone_id` from `GET /consumer/config/zone-id`.

---

## Implementation checklist (Flutter)

### Location

- [ ] On launch: GPS or saved address → zone-id.
- [ ] Pass same lat/lng into list calls and fee batch.
- [ ] On address change: clear fee session cache; refetch batch for visible ids.

### Home cards

- [ ] Add fee chip UI (loading / value / free / unavailable).
- [ ] After list load, call **batch** (not N× single GET).
- [ ] Merge by restaurant id; tolerate partial failures.
- [ ] Do not mark restaurant closed solely because fee failed or restriction code returned.

### Menu

- [ ] Show same fee from session cache or one single-restaurant GET.
- [ ] Recalculate if destination changed since home.

### Checkout

- [ ] Keep existing delivery-fee + quote + place flows.
- [ ] Handle restriction / unavailable codes as in Places + delivery restriction doc.

### Regression

- [ ] Home scrolls smoothly with fees loading asynchronously.
- [ ] Fee on home matches menu for same pin (allow tiny float formatting differences only).
- [ ] Checkout total still matches server quote after address set.
- [ ] Pickup mode: hide delivery fee chips if product requires.

---

## Open questions for the backend developer

1. **Final batch contract:** Done — `POST /consumer/config/delivery-fee/batch` (public, same as single GET).
2. **Auth:** Public (no Bearer), same as `GET /consumer/config/delivery-fee`.
3. **Max `restaurant_ids`:** Suggested 50 — confirm hard limit and 400 behavior when exceeded.
4. **Partial failures:** Confirm per-item `ok` / `code` in one `200` (preferred) vs failing the whole batch.
5. **Concurrency / Routes quotas:** Confirm server parallelization + Redis reuse so a 20-restaurant batch is safe under Google Routes limits.
6. **Free delivery / surge:** Confirm batch applies the same `applyFreeDelivery` + zone surge rules as single GET (consumer path).
7. **OpenAPI / Swagger:** Update customer Swagger when batch ships; current single-GET description may still mention outdated walking/haversine wording — align with DRIVE + `distance_source` `google`\|`cache`.
8. **Optional `distance_km` on single GET:** Schema accepts it but controller currently ignores it — can Flutter ignore forever?
9. **Currency / formatting:** Confirm currency code or symbol source (business config vs hard-coded ₪) for fee chips.
10. **ETA vs fee distance:** Confirm product does **not** want Routes duration on cards (only `delivery_time` string today).

---

## References

| Resource | Location |
|----------|----------|
| This brief | `gizra-backend/docs/FLUTTER_HOME_DELIVERY_FEE.md` |
| Places + checkout delivery-fee | `gizra-backend/docs/FLUTTER_PLACES_AND_DELIVERY_RESTRICTION.md` |
| Places / Routes notes | `gizra-backend/docs/CONSUMER_PLACES_API.md` |
| Single quote controller | `gizra-backend/src/controllers/consumer/DeliveryFee.ts` |
| Shared quote logic | `gizra-backend/src/utils/delivery/quoteDeliveryFee.ts` |
| Driving distance + Redis | `gizra-backend/src/utils/delivery/deliveryDistanceKm.ts` |
| Home card formatter | `gizra-backend/src/utils/consumer/restaurantDiscoverHelpers.ts` |
| Swagger (customer) | `{BASE_URL}/swagger/customer` — Consumer Config |

---

## Summary for Flutter

1. Show delivery price on home cards using the **same fields** as checkout (`delivery_fee`, etc.).
2. **Never** N× call `GET /consumer/config/delivery-fee` for the home list.
3. Use a **batch** (or list-embedded) API once backend lands it; until then, coordinate with backend — do not ship a per-card loop as a temporary “solution” for production home.
4. Session-cache by destination; invalidate on address change; refresh checkout with the existing single quote.
