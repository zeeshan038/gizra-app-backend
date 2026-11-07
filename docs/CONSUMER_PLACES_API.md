# Consumer Places API (Flutter / mobile)

Mobile apps **must not** call Google Places with an API key. Use these backend routes instead. The server reads **`GOOGLE_MAPS_API_KEY`** from the backend environment only.

Base URL: `{API_HOST}/api` (e.g. `https://dev-backend.gizra.app/api` or `http://127.0.0.1:3000/api`).

No `Authorization` header required (public).

**Swagger (Customer API):** `/swagger/customer` → tag **Consumer Config** — `place-autocomplete`, `place-details`, `geocode`.

## Endpoints

### 1. Autocomplete (while typing)

```http
GET /consumer/config/place-autocomplete?search_text=Tel%20Aviv
```

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

Optional env: `GOOGLE_PLACES_REGION_CODES=IL` (autocomplete country filter).  
`GOOGLE_PLACES_USE_LEGACY=1` only if you still use legacy Places on the key.

Restrict the key to server IP on production; do **not** embed this key in Flutter.

If autocomplete returns `status: "REQUEST_DENIED"`, enable **Places API (New)** on the GCP project for `GOOGLE_MAPS_API_KEY`, redeploy backend, and check `error_message`.

## Maps on screen

Rendering a **Google Map widget** in the app still uses a **separate SDK-restricted key** in the Flutter app env (Android/iOS restrictions). That key is **only** for the map tiles/SDK—not for these HTTP routes.
