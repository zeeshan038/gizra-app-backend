# Consumer Places API (Flutter / mobile)

Mobile apps **must not** call Google Places with an API key. Use these backend routes instead. The server reads **`GOOGLE_MAPS_API_KEY`** from the backend environment only.

Base URL: `{API_HOST}/api` (e.g. `https://dev-backend.gizra.app/api` or `http://127.0.0.1:3000/api`).

No `Authorization` header required (public).

**Swagger:** `/swagger/customer` (Consumer Config), `/swagger/vendor` (Vendor Config), `/swagger/driver` (Delivery Man Config) — same `place-autocomplete`, `place-details`, `geocode`, `distance` under each app’s `/config` prefix.

## Endpoints

### 1. Autocomplete (while typing)

```http
GET /consumer/config/place-autocomplete?search_text=Tel%20Aviv
```

Optional query (override server default bias near Hebron / Gush Etzion):

```http
GET /consumer/config/place-autocomplete?search_text=hebron&bias_lat=31.53&bias_lng=35.10&bias_radius_km=85
```

Server env defaults: `GOOGLE_PLACES_BIAS_LAT`, `GOOGLE_PLACES_BIAS_LNG`, `GOOGLE_PLACES_BIAS_RADIUS_KM`.

Response: Google Places Autocomplete JSON (`predictions`, `status`, …).

### 2. Place details (after user selects a prediction)

```http
GET /consumer/config/place-details?placeid=ChIJ...
```

Use `place_id` from a prediction. Response includes `result.geometry.location` and formatted address.

### 3. Reverse geocode (map pin, no place id)

```http
GET /consumer/config/geocode?lat=32.0853&lng=34.7818
```

Response: Google Geocoding JSON (`results`, `status`, …).

### Related (delivery checkout)

```http
GET /consumer/config/delivery-fee?restaurant_id=3&destination_lat=...&destination_lng=...
```

## Typical flows

**Search address:** autocomplete → user picks → place-details → save lat/lng + address.

**Map picker:** user sets pin → geocode → save address.

## Errors

| HTTP | Meaning |
|------|---------|
| 403 | Validation (missing `search_text`, `placeid`, etc.) |
| 500 | Server misconfiguration (no `GOOGLE_MAPS_API_KEY`) or Google error |

## Backend setup (Zeeshan / DevOps)

In `gizra-backend/.env`:

```env
GOOGLE_MAPS_API_KEY=your-server-restricted-key
```

Restart the API after changing this variable.

In [Google Cloud Console](https://console.cloud.google.com/) for that key’s project, enable billing and APIs used by this proxy:

- **Places API (New)** — autocomplete + place details (default backend path)
- Geocoding API — optional; reverse geocode (`/geocode`) falls back to **Places (New) searchNearby** if Geocoding is off
- Distance Matrix API — delivery distance fallback

Autocomplete region scope (env):

- **Default:** **worldwide** — no country code, no map rectangle, no server location bias.
- **`GOOGLE_PLACES_REGION_CODES=IL`** — limit to ISO country (optional).
- **`GOOGLE_PLACES_USE_COUNTRY_BOUNDS=1`** — restrict to Israel-area rectangle (optional).
- **`GOOGLE_PLACES_BIAS_LAT` + `GOOGLE_PLACES_BIAS_LNG`** — optional ranking near a hub; or pass `bias_lat` / `bias_lng` on the API from the app.

**Delivery** is enforced by **`GET /consumer/config/zone-id`** after the user picks an address (works in Pakistan, Israel, anywhere).

`GOOGLE_PLACES_USE_LEGACY=1` only if you still use legacy Places on the key.

Restrict the key to server IP on production; do **not** embed this key in Flutter.

If autocomplete returns `status: "REQUEST_DENIED"`, enable **Places API (New)** on the GCP project for `GOOGLE_MAPS_API_KEY`, redeploy backend, and check `error_message`.

## Maps on screen

Rendering a **Google Map widget** in the app still uses a **separate SDK-restricted key** in the Flutter app env (Android/iOS restrictions). That key is **only** for the map tiles/SDK—not for these HTTP routes.
