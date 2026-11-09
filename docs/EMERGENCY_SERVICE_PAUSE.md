# Emergency service pause (Super Admin)

Stop new customer orders by region during a security situation. Paired with the customer app banner and checkout guards.

## Admin (Super Admin web)

- **Path:** Business settings → **Emergency pause**
- **API:** `GET` / `PUT` `/api/admin/emergency-service-pause` (`role_id` 1)

| Control | Behavior |
|---------|----------|
| **Pause all zones** | Every row in `zones` |
| **Zones to pause** | Multi-select of `zone_id` values (from Zone Setup) |

Turning **Pause all** ON pauses every zone. Turn it OFF to pause only the zones selected in the dropdown.

Optional **notice message** (max 1000 chars) — shown in the customer app when pause is active.

## Customer app (Flutter)

**Implementation brief for mobile team:** [`FLUTTER_EMERGENCY_SERVICE_PAUSE.md`](./FLUTTER_EMERGENCY_SERVICE_PAUSE.md)

Read pause state from:

1. **`GET /api/consumer/config/bootstrap`** — field `emergency_service_pause`
2. **`GET /api/consumer/config/emergency-service-pause`** — same payload alone
3. **`GET /api/consumer/config/zone-id?lat=&lng=`** — field `emergency_service_pause` when the pin is in a paused zone

Example bootstrap fragment:

```json
{
  "maintenance_mode": false,
  "emergency_service_pause": {
    "active": true,
    "pause_all": false,
    "message": "Due to a security situation…",
    "paused_zone_ids": [8, 9],
    "zones": [
      { "zone_id": 9, "name": "gush", "display_name": "gush etzion", "paused": true },
      { "zone_id": 8, "name": "hebron", "display_name": "hebron", "paused": false }
    ]
  }
}
```

Show a prominent **security banner** when `emergency_service_pause.active` is true (use `message` for copy).

## Server enforcement

Blocked with HTTP **403**, `code`: **`EMERGENCY_SERVICE_PAUSED`**:

- `POST /api/consumer/order/place`
- `POST /api/consumer/order/quote`
- `GET /api/consumer/config/delivery-fee`

Rules:

- **Any order type:** block if the restaurant’s `zone_id` is paused.
- **Delivery:** also block if the delivery destination lies inside a paused zone.

Takeaway / dine-in from a restaurant in a paused zone is blocked. In-progress orders are not cancelled automatically.

## Database

Tables `emergency_service_pause_configs` (singleton) and `emergency_service_pause_zones` (selected `zone_id`s). Apply on deploy:

```bash
POSTGRES_CONTAINER=gizra-dev-postgres ./scripts/apply-schema-patches.sh
```

Or Prisma migrate in dev.

## API body (PUT)

```json
{
  "pause_all": false,
  "zone_ids": [8, 9],
  "notice_message": "Optional custom banner text"
}
```
