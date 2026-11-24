# How to Test Third-Party POS APIs (before client)

Use **Swagger UI** (recommended). Postman/curl still work as backups. You do **not** need the live Play Store app for this.

## Setup in Admin Panel (preferred)

1. Login to Admin Panel as Super Admin  
2. Go to **System Settings → 3rd Party & Configurations → 3rd Party POS**  
   (`/system/third-party-pos`)
3. **Create token** for a restaurant (`sandbox`) → copy token once  
4. **Add connection** with a https://webhook.site URL + merchant ID  
5. Keep the token for Swagger partner testing below  

Admin setup APIs still exist at `/api/admin/pos/...` but are managed from the panel, not POS Swagger.

## Swagger — partner APIs only

1. Start API: `npm run dev`
2. Open: [http://localhost:3000/swagger/pos](http://localhost:3000/swagger/pos)
3. **Authorize** → **posApiKeyAuth** → paste the token from Admin Panel  
4. `GET /v1/pos/orders` → pick order id  
5. `POST /v1/pos/orders/{id}/accept` (or reject)  
6. Check restaurant panel + webhook.site for new orders  

OpenAPI JSON: `/swagger-pos.json` (partner routes only — no admin auth)

## Prerequisites

1. Local/dev API running (`npm run dev`) on `http://localhost:3000`
2. SQL migration applied (already done on local DB if you ran it):

```bash
psql "$DATABASE_URL" -f scripts/sql/add-pos-integration-columns.sql
```

3. Optional in `.env`:

```env
POS_API_ENV=sandbox
```

If unset, non-production defaults to `sandbox`.

4. Super Admin account (role_id = 1)
5. A restaurant id (local sample: `3`)
6. Open https://webhook.site → copy your unique URL

## Import Postman

Import:

`docs/thirdparty-pos-api's/Gizra-POS-API.postman_collection.json`

Set collection variables:

| Variable | Example |
|---|---|
| `baseUrl` | `http://localhost:3000` |
| `adminEmail` | your super admin email |
| `adminPassword` | your super admin password |
| `restaurantId` | `3` |
| `webhookUrl` | `https://webhook.site/your-uuid` |

## Test order (do these in sequence)

### 1) Admin login
`POST {{baseUrl}}/api/admin/auth/login`

Saves `adminToken`.

### 2) Create POS API key
`POST {{baseUrl}}/api/admin/pos/api-keys`

```json
{
  "restaurant_id": 3,
  "name": "Sandbox Verifone Test",
  "provider": "verifone",
  "environment": "sandbox",
  "scopes": ["orders:read", "orders:write"]
}
```

**Copy `data.token` immediately** into collection var `posToken`.

### 3) Create webhook connection
`POST {{baseUrl}}/api/admin/pos/connections`

```json
{
  "restaurant_id": 3,
  "url": "{{webhookUrl}}",
  "provider": "verifone",
  "external_merchant_id": "TEST-MERCHANT-001",
  "events": ["order.created"],
  "active": true
}
```

### 4) Create / pick a pending order for that restaurant
Options:
- Place an order via consumer staging APIs, **or**
- Use an existing pending order id from DB / restaurant panel

Put it in `orderId`.

### 5) Trigger webhook
If you place a **new** order for restaurant `3`, Gizra auto-enqueues `order.created`.

Check:
- webhook.site shows the POST
- `GET {{baseUrl}}/api/admin/pos/deliveries?order_id={{orderId}}`

### 6) Partner get order
`GET {{baseUrl}}/api/v1/pos/orders/{{orderId}}`  
Header: `Authorization: Bearer {{posToken}}`

### 7) Partner accept
`POST {{baseUrl}}/api/v1/pos/orders/{{orderId}}/accept`

Expect `order_status: confirmed`.

### 8) Verify in Gizra
Open **dev restaurant panel** — order should show accepted/confirmed.

### 9) Reject path (use another pending order)
`POST {{baseUrl}}/api/v1/pos/orders/{{orderId}}/reject`

```json
{ "reason": "Out of stock" }
```

## Pass / fail checklist

- [ ] API key created and token returned once
- [ ] Connection created
- [ ] `order.created` appears on webhook.site (or deliveries show `delivered_at`)
- [ ] GET order works with POS token
- [ ] Accept updates order + restaurant panel
- [ ] Reject updates order to canceled
- [ ] Wrong token → 401
- [ ] Token for restaurant A cannot accept restaurant B order → 404

## Curl alternative

```bash
cd gizra-backend
chmod +x scripts/smoke-pos-api.sh
./scripts/smoke-pos-api.sh
```

The script prompts for admin credentials / restaurant / webhook URL / order id.

## What to tell the client after this passes

“Sandbox POS APIs are verified: token auth, webhook delivery, accept/reject, and Gizra order sync work on our staging/dev environment.”
