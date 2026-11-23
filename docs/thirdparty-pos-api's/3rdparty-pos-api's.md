
A webhook is **not** a separate server. It is an HTTP request sent automatically from the existing Gizra backend when an event happens.

---

## 5. Proposed APIs (v1)

> Final paths/payloads to be locked after POS partner capability review.

### Gizra → POS (webhooks)

| Event | Purpose |
|---|---|
| `order.created` | New order payload (items, modifiers, totals, payment, instructions) |
| `order.updated` | Relevant order changes (if partner supports) |
| `order.cancelled` | Cancellation notice (if partner supports) |

Outbound webhooks are signed (HMAC or equivalent), sent over HTTPS, with unique event IDs for idempotency.

### POS → Gizra (REST)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/v1/pos/orders/{id}/accept` | Accept order |
| POST | `/api/v1/pos/orders/{id}/reject` | Reject with reason |
| POST | `/api/v1/pos/orders/{id}/ready` | Optional: food ready |
| GET | `/api/v1/pos/orders/{id}` | Authoritative order details |
| GET | `/api/v1/pos/orders` | Missed-order recovery / reconciliation |

---

## 6. Restaurant Identification & Mapping

Each POS connection links:

| Field | Purpose |
|---|---|
| `restaurant_id` | Gizra restaurant that owns the order |
| `pos_provider` | e.g. Verifone |
| `external_merchant_id` | Provider store/terminal mapping |
| `webhook_endpoint` | Destination for outbound events (if supported) |
| `integration_credentials` | Encrypted secrets |
| `enabled` / `connection_status` | Routing and monitoring |

Credentials are **restaurant-scoped** (or partner keys authorized only for mapped restaurants). Not a shared unrestricted login.

---

## 7. Authentication & Tokens

### 7.1 Two different secrets

| Direction | What | Who issues |
|---|---|---|
| POS → Gizra APIs | **API token** (`gz_test_…` / `gz_live_…`) | Gizra Super Admin |
| Gizra → POS webhook | **HMAC signing secret** (and/or credentials POS gives Gizra) | Shared / configured per connection |

**Important:** The API token is **not** “for calling the webhook.”  
- Token = door key **into Gizra** (accept/reject/list).  
- Webhook signature = proof the order **came from Gizra**.

### 7.2 Who generates the API token?

| Role | Responsibility |
|---|---|
| **Super Admin** | Create POS partner, generate/revoke sandbox & live tokens, attach allowed restaurants |
| **Restaurant Panel** | Enable POS, select provider, set merchant mapping, view connection status — **does not** mint the partner master API key |
| **POS partner** | Receives token + docs; uses Bearer token on REST calls |

Token handling:
1. Generate strong random secret.
2. Show full token **once**.
3. Store **hash only** in DB.
4. Partner sends `Authorization: Bearer <token>`.
5. Support revoke / rotate.

---

## 8. Sandbox vs Live

### 8.1 Two environments

| | Sandbox | Live |
|---|---|---|
| Purpose | Partner integration testing | Real restaurants / real orders |
| API | Staging/dev API host | Production API host |
| DB | Development / staging DB | Production DB |
| Tokens | `gz_test_…` | `gz_live_…` |
| Restaurants | Test restaurants only | Real restaurants |
| Webhook URL | Partner’s sandbox endpoint | Partner’s live endpoint |

### 8.2 Current Gizra reality

| Asset | Status |
|---|---|
| Dev restaurant panel | Available (e.g. `dev.restaurant.gizra…`) |
| Dev/staging backend + DB | Use as POS **sandbox** |
| Mobile app | Play Store **live only** (prod) |

**This is OK for v1.**  
We do **not** need a sandbox Play Store app for POS partner UAT.

### 8.3 How sandbox testing works without a sandbox mobile app

Live Play Store app stays on **prod only** and never points at the dev DB.

Sandbox flow:
1. Gizra issues sandbox token + docs + test restaurant mapping.
2. **Gizra team** creates a test order on staging/dev (Postman / place-order API / optional staging tools).
3. Staging Gizra sends `order.created` to partner sandbox webhook.
4. Partner accepts/rejects via sandbox REST APIs with `gz_test_…`.
5. Team verifies result in **dev restaurant panel** + staging DB.

After UAT passes → issue live token, map real restaurant, go live.

### 8.4 Rule

- Sandbox tokens never talk to prod DB.
- Live app never talks to sandbox DB.
- Same codebase; different host + DB + keys.

---

## 9. Where This Runs (Infrastructure)

Everything on the Gizra side runs on the **existing Node.js backend** (no separate webhook server).

### 9.1 Folder structure (implemented)

```text
gizra-backend/
├── docs/thirdparty-pos-api's/
│   └── 3rdparty-pos-api's.md
├── scripts/sql/
│   └── add-pos-integration-columns.sql
└── src/
    ├── routes/
    │   ├── pos/
    │   │   ├── index.ts                 → /api/v1/pos
    │   │   └── orders.ts                → accept/reject/get/list
    │   └── admin/pos.ts                 → /api/admin/pos (super admin)
    ├── controllers/
    │   ├── pos/orders.ts
    │   └── admin/pos.ts
    ├── middlewares/verifyPosPartner.ts
    ├── schemas/
    │   ├── pos/orders.ts
    │   └── admin/pos.ts
    └── utils/pos/
        ├── auth/token.ts
        ├── auth/scope.ts
        ├── connections/repository.ts
        ├── orders/acceptReject.ts
        ├── orders/getOrder.ts
        ├── orders/listOrders.ts
        ├── webhook/publisher.ts
        ├── webhook/payload.ts
        ├── webhook/signer.ts
        └── queue/worker.ts              → DB-backed retry worker
```

### 9.2 Implemented v1 endpoints

| Method | Path | Auth |
|---|---|---|
| POST | `/api/v1/pos/orders/:id/accept` | POS Bearer token |
| POST | `/api/v1/pos/orders/:id/reject` | POS Bearer token |
| GET | `/api/v1/pos/orders/:id` | POS Bearer token |
| GET | `/api/v1/pos/orders` | POS Bearer token |
| POST | `/api/admin/pos/api-keys` | Super Admin |
| GET | `/api/admin/pos/api-keys` | Super Admin |
| POST | `/api/admin/pos/api-keys/:id/revoke` | Super Admin |
| POST | `/api/admin/pos/connections` | Super Admin |
| GET | `/api/admin/pos/connections` | Super Admin |
| PATCH | `/api/admin/pos/connections/:id` | Super Admin |
| GET | `/api/admin/pos/deliveries` | Super Admin |
| POST | `/api/admin/pos/deliveries/:id/replay` | Super Admin |

### 9.3 DB migration

Run on each environment before using POS APIs:

```bash
psql "$DATABASE_URL" -f scripts/sql/add-pos-integration-columns.sql
```

### 9.4 Env

| Variable | Purpose |
|---|---|
| `POS_API_ENV` | `sandbox` or `live` — must match token environment on that host (defaults from `NODE_ENV`) |

Suggested reuse:
- Existing order accept/reject + `emitOrderStatusRealtime`
- New-order notify hook → POS webhook enqueue
- DB-backed webhook retry worker (no Bull required for v1)

---

## 10. Security & Reliability

- Partner credentials with restaurant-scoped authorization
- Verify order ownership on every POS API call
- Sign outbound webhooks; HTTPS only; rotate secrets
- Unique event IDs + idempotency (retries must not duplicate accept)
- Queue webhook delivery: retries, backoff, delivery logs, dead-letter / replay
- Acknowledge webhooks quickly; delivery ≠ restaurant accepted the order
- Validate legal status transitions
- Handle races if both Gizra Restaurant Panel and POS can act (first valid transition wins)
- Support polling/reconciliation for downtime
- Monitor delivery latency and failures

---

## 11. Gizra Development Scope

| Workstream | Deliverable |
|---|---|
| Backend integration layer | POS connections, credentials, merchant mapping, webhook publisher, queue, API controllers |
| Order lifecycle | Shared accept/reject service; preserve socket, push, dispatch |
| Super Admin | Create partner, generate sandbox/live tokens, enable mapping, connection status |
| Restaurant settings | Enable/disable POS, select provider, merchant ID, status view |
| Monitoring | Webhook attempt history, errors, replay, audit trail |
| Partner docs | OpenAPI/Swagger, webhook schemas, auth guide, sample requests, sandbox credentials |
| QA | E2E, duplicate/retry, unauthorized access, offline recovery |

### Suggested v1 cut

Ship first:
- `order.created` webhook
- Accept / reject APIs
- GET order + list for reconciliation
- Super Admin token + restaurant mapping
- Delivery logs / basic retry

Defer if needed:
- `ready` status
- Full `order.updated` / `order.cancelled` set (confirm with partner)
- Fancy partner self-serve portal

---

## 12. POS Partner Responsibilities

- Confirm third-party integration support and provide technical contact
- Implement webhook receiver **or** provide alternative API Gizra can call
- Map Gizra restaurant IDs ↔ merchant stores/terminals
- Display orders and send authenticated accept/reject
- Handle duplicate events safely
- Join sandbox and live testing

**Dependency:** Gizra cannot force orders onto a closed POS. Partner must support the agreed integration.

---

## 13. Mapping to Current Gizra Backend (Today)

| Existing piece | Role in this plan |
|---|---|
| `PUT /api/vendor/orders/:id/status` | Internal accept/reject path to reuse (`confirmed`/`accepted`/`canceled`) |
| `emitOrderStatusRealtime` / Socket.io | Keep for Gizra apps; POS never connects here |
| `sendNewOrderNotification` / place-order flow | Hook point to also enqueue POS webhook |
| Vendor POS app settings | Unrelated Gizra-owned POS app; separate from third-party Verifone-style integration |
| HyperPay webhook | Existing payment webhook pattern; POS webhooks are a new outbound domain |
| Unused `partner_webhooks` / `partner_api_keys` tables (if present) | Evaluate reuse vs new schema during implementation |

---

## 14. Open Points Before Build

1. Does the POS partner accept **inbound webhooks**, or must Gizra call **their** push API?
2. Exact event list they support (`created` only vs updated/cancelled/ready).
3. Sandbox webhook URL + test merchant IDs from partner.
4. Race policy when both Restaurant Panel and POS can accept/reject.
5. Confirm staging API host that will act as official POS sandbox URL.

---

## 15. One-Line Summary

**Build a partner POS layer on the existing Gizra backend: signed webhooks out, token-authenticated REST in, same order engine and Socket.io for Gizra apps — with Super Admin–issued sandbox/live tokens, restaurant mapping in admin/panel, and partner UAT against staging DB without a sandbox Play Store app.**