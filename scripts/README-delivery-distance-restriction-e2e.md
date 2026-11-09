# Delivery distance time restriction — E2E for frontend / Flutter

## Quick run (backend must be on `PORT`, default 3000)

```bash
cd gizra-backend
npm run test:delivery-distance-restriction-e2e
```

The script:

1. Logs in as super admin (`ADMIN_EMAIL` / `ADMIN_PASSWORD`, default `admin@gizra.com` / `12345678`).
2. Temporarily widens the restriction **time window to include now** (then restores your saved config).
3. Creates or uses E2E consumer `+972501000099` / `password` if no `GIZRA_TOKEN`.
4. Calls **delivery-fee** and **order/quote** for Nickel Barn (`RESTAURANT_ID=3`) at ~5 km (OK) and ~14 km (blocked).
5. Writes full request/response samples to `scripts/output/delivery-distance-restriction-frontend-handoff.json`.

## Optional env

| Variable | Default | Purpose |
|----------|---------|---------|
| `GIZRA_API_URL` | `http://127.0.0.1:3000` | API host (no `/api` suffix) |
| `RESTAURANT_ID` | `3` | Target restaurant |
| `ACTIVATE_WINDOW` | `1` | `0` = do not change admin schedule |
| `RESTORE_CONFIG` | `1` | `0` = leave widened window after test |
| `PLACE_NEAR_COD` | `0` | `1` = also `POST /consumer/order/place` at near address |
| `GIZRA_TOKEN` | — | Skip consumer login |

## APIs to wire in the app

- `GET /api/consumer/config/delivery-fee?restaurant_id=&destination_lat=&destination_lng=`
- `POST /api/consumer/order/quote` (same cart body as place)
- `POST /api/consumer/order/place`

When blocked: HTTP **403**, `code: "DELIVERY_DISTANCE_TIME_RESTRICTED"`, plus `max_distance_km`, `restriction_end_time`, `timezone`.

## Manual testing outside the script window

In Super Admin → **Delivery distance time**, enable the rule and set hours that include the current time in `Asia/Jerusalem`, or run the script once with `RESTORE_CONFIG=0`.
