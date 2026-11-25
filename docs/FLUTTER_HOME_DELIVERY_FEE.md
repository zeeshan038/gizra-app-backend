# Flutter customer app — home & menu delivery fee

**Audience:** Flutter developer (paste this file into Cursor for implementation).  
**Backend repo:** `gizra-backend`  
**Swagger:** `{BASE_URL}/swagger/customer` → tag **Consumer Config**  
**Related docs:** `FLUTTER_PLACES_AND_DELIVERY_RESTRICTION.md`, `CONSUMER_PLACES_API.md`  
**Last updated:** 2026-11-25  

---

## Cursor / AI instructions (copy below into your prompt)

```
Implement home + menu delivery fee display in the Gizra consumer Flutter app.

Product goal: on app launch, use GPS / saved delivery pin and show delivery fee,
estimated delivery time, and open status on restaurant cards and menu pages.
Fees must match checkout.

Rules:
1) Home list: POST /consumer/config/delivery-fee/batch (ONE request for visible IDs).
   NEVER call GET /consumer/config/delivery-fee once per home card.
2) Menu / checkout: GET /consumer/config/delivery-fee (single restaurant).
3) Session-cache fees by rounded lat/lng; clear cache when delivery address changes.
4) Do NOT invent fees with Haversine. Do NOT use card.distance for billing.
5) Checkout remains authoritative via delivery-fee + order/quote + place.

Follow gizra-backend/docs/FLUTTER_HOME_DELIVERY_FEE.md checklist.
Swagger: {BASE_URL}/swagger/customer — Consumer Config.
```

---

## Base URL & auth

| Item | Value |
|------|--------|
| API prefix | `{BASE_URL}/api` e.g. `https://dev-backend.gizra.app/api` |
| Batch + single delivery-fee | **Public** (no Bearer required). Sending consumer Bearer is fine if your client always attaches it. |
| OpenAPI | `gizra_customer.openapi.json` / `swagger-customer.json` |

---

## Product goal

On launch, detect customer location and show on **restaurant cards** and **menu**:

1. **Delivery fee** (road distance — same as checkout)
2. **Estimated delivery time** (`delivery_time` already on list APIs)
3. **Opening / open status** (`open`, `status`, `next_open_at`, … already on list APIs)

Hard rules:

| Requirement | How |
|-------------|-----|
| Road distance | Server Google Routes `DRIVE` (never client Haversine for fees) |
| Single backend request for home fees | `POST /consumer/config/delivery-fee/batch` |
| Session cache | In-memory map keyed by rounded destination + restaurant id |
| Recalc on address change | Clear cache → refetch batch |
| Consistent with checkout | Same server quote helper; checkout quote/place still authoritative |

---

## APIs

### A) Batch quote — **home screen** (use this)

```http
POST /api/consumer/config/delivery-fee/batch
Content-Type: application/json
```

**Request**

```json
{
  "destination_lat": 32.0853,
  "destination_lng": 34.7818,
  "restaurant_ids": [3, 7, 12, 19]
}
```

| Field | Required | Notes |
|-------|----------|--------|
| `destination_lat` | yes | Delivery pin (GPS or saved address) |
| `destination_lng` | yes | Delivery pin |
| `restaurant_ids` | yes | 1–**50** positive ints; server dedupes |

**Success `200`** — always 200 for valid body; check each quote’s `ok`:

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
      "delivery_fee": null,
      "distance_km": 14.02,
      "max_distance_km": 10,
      "restriction_end_time": "20:30",
      "timezone": "Asia/Jerusalem"
    }
  ]
}
```

**Validation `403`**

```json
{ "status": false, "msg": "…" }
```

Examples: missing coords, empty `restaurant_ids`, more than 50 ids.

**Swagger operationId:** `postConsumerConfigDeliveryFeeBatch`

---

### B) Single quote — **menu / checkout** (existing)

```http
GET /api/consumer/config/delivery-fee?restaurant_id={id}&destination_lat={lat}&destination_lng={lng}
```

**Success `200`**

```json
{
  "restaurant_id": 3,
  "distance_km": 4.2,
  "distance_source": "google",
  "delivery_fee": 9.4,
  "original_delivery_fee": 9.4,
  "pricing": { "…": "…" }
}
```

**Errors (HTTP status on single GET only)**

| HTTP | `code` | UI |
|------|--------|-----|
| 403 | `DELIVERY_DISTANCE_TIME_RESTRICTED` | Soft banner — **not** “restaurant closed”; offer pickup / closer address |
| 403 | `EMERGENCY_SERVICE_PAUSED` | Follow emergency pause UX |
| 503 | `DELIVERY_DISTANCE_UNAVAILABLE` (`retryable: true`) | Show retry; do not invent a fee |

On **batch**, the same codes appear **inside** `quotes[i]` with `ok: false` (HTTP still 200).

**Swagger operationId:** `getConsumerConfigDeliveryFee`

---

### C) Restaurant lists (existing — ETA + open status)

Pass location so cards get Haversine `distance` badge (display only — **not for fees**):

```http
GET /api/consumer/restaurants/popular?latitude={lat}&longitude={lng}
GET /api/consumer/restaurants/nearby?latitude={lat}&longitude={lng}
GET /api/consumer/restaurants/all?latitude={lat}&longitude={lng}
GET /api/consumer/restaurants/specific/{id}
```

| Field on card | Use for |
|---------------|---------|
| `delivery_time` | ETA label (e.g. `"30-45-min"`) |
| `open`, `can_order`, `status` | Open / closed |
| `next_open_at`, `next_close_at` | “Opens at …” |
| `distance`, `distance_text` | Optional straight-line badge only |
| `delivery_fee` | **Not** on list APIs — merge from batch |

---

## Flutter flow

```
App launch
  → resolve delivery pin (saved address > GPS)
  → GET zone-id?lat=&lng=  (404 → “We don’t deliver here”)
  → load restaurant lists with latitude/longitude
  → POST delivery-fee/batch { lat, lng, restaurant_ids from lists }
  → merge quotes onto cards by restaurant_id
  → cache in session

Open menu
  → use session cache for that restaurant_id
  → if miss: GET delivery-fee?restaurant_id=&destination_lat=&destination_lng=

Address change
  → clear session fee cache
  → refetch batch for visible IDs

Checkout
  → GET delivery-fee + POST order/quote (authoritative — ignore home cache for place)
```

---

## Delivery pin on launch

Priority:

1. Saved / selected delivery address for this session  
2. Else GPS (request permission)  
3. Else last-known pin  
4. No location → show cards **without** fee (`—` / hide fee); still show `delivery_time` + open status  

After pin known:

```http
GET /consumer/config/zone-id?lat=&lng=
```

- **404** → do not treat fees as orderable; existing “We don’t deliver here” UX  
- Keep **pin lat/lng** as destination for fee APIs (same as Places doc)

---

## Session cache

```dart
// Key destination with 5 decimal places (~1.1 m), same spirit as server Redis keys
class DeliveryFeeSessionCache {
  // Map: "${latRounded}_${lngRounded}" → Map<int restaurantId, FeeQuote>
}
```

Rules:

- In-memory for app session  
- On address change (or GPS move &gt; ~50–100 m): **clear all** and refetch  
- Pagination / more restaurants: batch only **missing** ids; merge into cache  
- Menu: cache hit first, else single GET  
- Logout (optional): clear cache  

---

## UI binding

| UI | Source |
|----|--------|
| Fee on card | Batch `quotes[].delivery_fee` when `ok == true` |
| Free delivery | `delivery_fee == 0` (and/or vs `original_delivery_fee`) |
| Fee unavailable | `ok == false` → `—` / omit chip; keep card visible |
| Restriction | Soft chip/banner; **do not** mark restaurant Closed |
| ETA | List field `delivery_time` |
| Open / closed | `open` / `status` / `next_open_at` |

Currency formatting: use your existing app currency helper (e.g. `₪9.4 delivery` / `Free delivery`).

---

## Error codes (Dart constants)

```dart
const kDeliveryDistanceTimeRestricted = 'DELIVERY_DISTANCE_TIME_RESTRICTED';
const kEmergencyServicePaused = 'EMERGENCY_SERVICE_PAUSED';
const kDeliveryDistanceUnavailable = 'DELIVERY_DISTANCE_UNAVAILABLE';
```

---

## Suggested Dart layout

```text
lib/features/delivery_fee/
  delivery_fee_repository.dart    # getFee(), getFeesBatch()
  delivery_fee_session_cache.dart
  delivery_fee_models.dart        # shared quote model for GET + batch ok item

lib/features/home/
  # after lists load → batch → merge into card widgets

lib/features/restaurant/
  # menu header fee from cache or single GET
```

`DeliveryFeeRepository` talks only to Gizra APIs — **no** Google Routes/Places REST from the app.

Normalize ids: list APIs often return `id` as **string**; batch uses **int** `restaurant_id`. Compare with `int.tryParse` / consistent string keys.

---

## Do / Don’t

**Do**

- One batch call for the visible home set (debounce 150–300 ms if lists settle slowly)  
- Chunk if &gt; 50 ids (two batch calls max for huge pages)  
- Trust checkout quote/place over home cache when placing an order  

**Don’t**

- N× `GET .../delivery-fee` on home  
- Compute fee from Haversine `distance` on the card  
- Hide restaurants when fee quote fails or is restricted  
- Skip `order/quote` because home already showed a fee  

---

## Consistency with checkout

| Screen | Fee source |
|--------|------------|
| Home cards | `POST .../delivery-fee/batch` |
| Menu header | Cache or `GET .../delivery-fee` |
| Checkout | `GET .../delivery-fee` + `POST .../order/quote` + place |

Same pin + restaurant should match closely. If they differ (rare: surge, free delivery, cache TTL), **checkout wins**.

---

## Acceptance checklist

### Home

- [ ] With location, cards show fee + `delivery_time` + open status  
- [ ] Only **one** batch request for the initial visible set (not N singles)  
- [ ] Session cache used when revisiting home / scrolling back  
- [ ] Address change clears cache and refreshes fees  
- [ ] Restricted quotes keep the card listed (not “Closed”)  

### Menu

- [ ] Header shows fee for current pin  
- [ ] Uses cache or single GET  
- [ ] Matches checkout closely  

### Checkout

- [ ] Existing delivery-fee + quote + place flows unchanged  
- [ ] Never places using only home cache  

### QA matrix

| Scenario | Expected |
|----------|----------|
| GPS on launch | Fees on cards; one batch |
| Open menu | Same fee as home (cache/GET) |
| Change address | Fees update |
| Checkout same restaurant | Quote ≈ displayed fee |
| Restriction + far pin | Card visible; fee blocked / warning |
| Routes down | Card fee `—`; checkout retryable |
| No location permission | No fee; ETA/open still shown |
| &gt; 50 restaurants on page | Chunk into multiple batch calls ≤ 50 |

---

## Curl examples

```bash
# Batch (home)
curl -s -X POST "$API/api/consumer/config/delivery-fee/batch" \
  -H "Content-Type: application/json" \
  -d '{"destination_lat":32.0853,"destination_lng":34.7818,"restaurant_ids":[3,7,12]}'

# Single (menu / checkout)
curl -s "$API/api/consumer/config/delivery-fee?restaurant_id=3&destination_lat=32.0853&destination_lng=34.7818"
```

---

## Out of scope

- Dynamic ETA from live traffic (use restaurant `delivery_time` string)  
- Full weekly hours grid on the card (use open/closed + `next_open_at`)  
- Changing checkout pricing formula  
- Embedding `delivery_fee` on list APIs (optional later; batch is the contract now)  
