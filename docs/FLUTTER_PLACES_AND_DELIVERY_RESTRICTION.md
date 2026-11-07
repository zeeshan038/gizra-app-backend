# Flutter customer app — implementation brief

**Audience:** Flutter developer (paste this file into Cursor for implementation).  
**Backend repo:** `gizra-backend`  
**Last updated:** 2026-11-07  

---

## Cursor / AI instructions (copy below into your prompt)

```
Implement two backend-driven features in the Gizra consumer Flutter app:

1) PLACES — Remove any direct HTTP calls to maps.googleapis.com for autocomplete/details/geocode.
   Call Gizra API only (see "Part A" in FLUTTER_PLACES_AND_DELIVERY_RESTRICTION.md).
   Keep a separate GOOGLE_MAPS_SDK_KEY only for the GoogleMap widget (tiles), not for Places REST.

2) DELIVERY DISTANCE TIME RESTRICTION — Do not close/hide restaurants when admin enables the rule.
   On delivery checkout, call delivery-fee + order/quote; handle HTTP 403 with
   code DELIVERY_DISTANCE_TIME_RESTRICTED (see "Part B").

Follow the checklist at the end of the doc. Use server distance_km from API responses; ignore client distance for enforcement.
Swagger: {BASE_URL}/swagger/customer — tags Consumer Config (Places, delivery-fee) and Consumer Orders (quote/place).
```

---

## Base URL & auth

| Item | Value |
|------|--------|
| API prefix | `{BASE_URL}/api` e.g. `https://dev-backend.gizra.app/api` |
| Places endpoints | **Public** — no `Authorization` header |
| Delivery fee / quote / place | Consumer **Bearer** token (same as today) |

---

# Part A — Google Places (server proxy)

## Rule

- **Do not** embed a Google **Places / Geocoding REST** API key in the app.
- **Do** call Gizra’s three GET routes; the server uses `GOOGLE_MAPS_API_KEY`.
- **Optional:** `GOOGLE_MAPS_SDK_KEY` in Flutter **only** for `GoogleMap` (Android/iOS SDK restrictions).

## Endpoints (Swagger: **Consumer Config**)

### A1. Autocomplete (user typing)

```http
GET /consumer/config/place-autocomplete?search_text={query}
```

- Debounce ~300ms; min length 1.
- Parse body: Google shape — `status`, `predictions[]`, optional `error_message`.
- On `status: "OK"`, show `predictions[].description`; store `predictions[].place_id`.

### A2. Place details (user selected a row)

```http
GET /consumer/config/place-details?placeid={place_id}
```

- Query param is **`placeid`** (not `place_id`).
- On `status: "OK"`:  
  - `lat` = `result.geometry.location.lat`  
  - `lng` = `result.geometry.location.lng`  
  - `address` = `result.formatted_address`

### A3. Reverse geocode (map pin)

```http
GET /consumer/config/geocode?lat={lat}&lng={lng}
```

- On `status: "OK"`: use `results[0].formatted_address` and geometry.

### Flow diagram

```
Search flow:  search_text → autocomplete → placeid → place-details → save lat/lng/address
Map flow:     user moves pin → geocode(lat,lng) → save address
Checkout:     after address known → delivery-fee (Part B)
```

### Places errors

| HTTP | Body | App action |
|------|------|------------|
| 200 | `status: "REQUEST_DENIED"` etc. | Show `error_message`; log; no crash |
| 403 | `{ status: false, msg: "..." }` | Validation (empty search) |
| 500 | `{ status: false, msg: "..." }` | Server/key misconfig |

### Dart module suggestion

```text
lib/features/address/
  places_repository.dart   # autocomplete(), resolvePlace(), reverseGeocode()
  address_search_screen.dart
  address_map_picker_screen.dart
```

`PlacesRepository` should only know `baseUrl + /consumer/config/...` — no Google URLs.

---

# Part B — Time-based delivery distance restriction

## Product rule (important)

Admin **“restriction active”** does **not** mean the restaurant is closed.

- **Pickup:** always allowed (rule does not apply).
- **Delivery:** blocked only when **all** are true:
  1. Admin enabled rule  
  2. Restaurant is in admin’s selected restaurant list  
  3. Current time is inside configured window (timezone e.g. `Asia/Jerusalem`)  
  4. **Server** delivery distance **>** `max_distance_km` (e.g. 10 km)

Nearby delivery during the window **still works**. Do **not** hide the restaurant from the list.

## Where enforcement happens (call these)

| When | API |
|------|-----|
| User picks/changes delivery address or restaurant | `GET /consumer/config/delivery-fee` |
| Cart / checkout totals | `POST /consumer/order/quote` |
| Place order | `POST /consumer/order/place` |
| Payment-link dry run | Same quote/place paths as backend uses |

**Do not** rely on `distance` sent from the client in the place body for restriction; server recomputes km.

### B1. Delivery fee

```http
GET /consumer/config/delivery-fee?restaurant_id={id}&destination_lat={lat}&destination_lng={lng}
Authorization: Bearer {token}
```

**200** — show fee; use `distance_km`, `delivery_fee`, `pricing` from body.

**403** — if `code == "DELIVERY_DISTANCE_TIME_RESTRICTED"`:

| Field | Use in UI |
|-------|-----------|
| `msg` | Primary message |
| `max_distance_km` | e.g. “Delivery limited to 10 km during this window” |
| `restriction_end_time` | e.g. `20:30` (local to `timezone`) |
| `timezone` | e.g. `Asia/Jerusalem` |
| `distance_km` | Server distance (show optional) |

**UX:** Banner on checkout; disable place; offer **pickup** or **closer address** — not “restaurant closed”.

### B2. Quote & place

Same error shape on **403** for delivery orders:

```json
{
  "status": false,
  "msg": "Delivery is temporarily limited to 10 km during restricted hours.",
  "code": "DELIVERY_DISTANCE_TIME_RESTRICTED",
  "max_distance_km": 10,
  "restriction_end_time": "20:30",
  "timezone": "Asia/Jerusalem"
}
```

Parse `code` on quote and place failures; do not only check `msg`.

### Scheduled orders

If the app supports `schedule_at`, the server evaluates the restriction for **scheduled delivery time** (not only “now”). Keep sending `schedule_at` as today; no extra Flutter field for restriction.

### Constants

```dart
const kDeliveryDistanceTimeRestricted = 'DELIVERY_DISTANCE_TIME_RESTRICTED';
```

---

## Sample responses (local QA)

Dev machine example (restaurant **#3**, rule active in window). Full JSON:  
`gizra-backend/scripts/output/delivery-distance-restriction-frontend-handoff.json`

| Scenario | Lat / Lng (approx.) | delivery-fee | quote |
|----------|---------------------|--------------|-------|
| Near ~5 km | `33.61025, 73.15197` | 200 | 200 |
| Far ~14 km | `33.69133, 73.15197` | 403 + code | 403 + code |

Test consumer (created by E2E script):

- Phone: `+972501000099`  
- Password: `password`  
- Login: `POST /consumer/login` (manual / phone)

Backend self-test:

```bash
cd gizra-backend && npm run test:delivery-distance-restriction-e2e
cd gizra-backend && npm run test:consumer-places
```

---

## Implementation checklist

### Places

- [ ] Remove direct `maps.googleapis.com` Places/Geocode HTTP from Flutter.
- [ ] Implement `PlacesRepository` with three GETs (A1–A3).
- [ ] Wire address search UI: autocomplete → details.
- [ ] Wire map picker: geocode on pin idle.
- [ ] After address set, refresh `delivery-fee` (Part B).
- [ ] SDK map key remains env-only for `GoogleMap`, not for search.

### Delivery restriction

- [ ] On address/restaurant change (delivery mode): call `delivery-fee`.
- [ ] Handle 403 + `DELIVERY_DISTANCE_TIME_RESTRICTED` with banner (max km, end time, timezone).
- [ ] Quote on checkout; same error handling.
- [ ] Place order; same error handling.
- [ ] Do not mark restaurant closed in listings when rule is on.
- [ ] Pickup path unchanged (no distance-time block).

### Regression

- [ ] Pickup order still works.
- [ ] Delivery under max km during window works.
- [ ] Delivery over max km during window blocked with clear copy.
- [ ] Outside admin time window, far delivery allowed (if zone pricing allows).

---

## References

If autocomplete returns `REQUEST_DENIED` about **legacy API**, the backend must use **Places API (New)** (default since 2026-11-07) and GCP must enable **Places API (New)** on the server key — not legacy “Places API”.

| Resource | Location |
|----------|----------|
| Swagger UI (customer) | `{BASE_URL}/swagger/customer` — **Consumer Config** (Places, delivery-fee) and **Consumer Orders** (quote/place, 403 `DELIVERY_DISTANCE_TIME_RESTRICTED`) |
| Swagger UI (admin) | `{BASE_URL}/swagger/admin` — **Admin Business** → `GET/PUT /admin/delivery-distance-time-restriction` |
| OpenAPI file | `gizra-backend/gizra_customer.openapi.json` |
| Places detail | `gizra-backend/docs/CONSUMER_PLACES_API.md` |
| Restriction E2E notes | `gizra-backend/scripts/README-delivery-distance-restriction-e2e.md` |
| Sample restriction JSON | `gizra-backend/scripts/output/delivery-distance-restriction-frontend-handoff.json` |

---

## Server: missing `delivery_distance_time_restriction_configs` table

If the admin page shows **Could not load settings** / table does not exist, on the **dev VPS** (`~/gizra-dev`):

```bash
cd ~/gizra-dev
git pull
POSTGRES_CONTAINER=gizra-dev-postgres ./scripts/apply-schema-patches.sh
```

Or full dev redeploy (also applies patches):

```bash
npm run deploy:dev -- --pull
```

Prod stack (`~/gizra-app-backend`): use `POSTGRES_CONTAINER=gizra-postgres` and `npm run deploy:server`.

Verify:

```bash
docker exec gizra-dev-postgres psql -U postgres -d gizra_db -c \
  "\\dt delivery_distance_time_restriction*"
```

---

## Out of scope for Flutter

- Admin configuration (`/admin/delivery-distance-time-restriction`) — Super Admin web only.
- Changing `GOOGLE_MAPS_API_KEY` on server — DevOps.
- Manual dispatch orders — separate backend path; consumer app uses place/quote only.
