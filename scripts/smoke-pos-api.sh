#!/usr/bin/env bash
# Interactive smoke test for third-party POS APIs (local/dev).
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

echo "Gizra POS API smoke test"
echo "Base URL: $BASE_URL"
echo

read -r -p "Super admin email: " ADMIN_EMAIL
read -r -s -p "Super admin password: " ADMIN_PASSWORD
echo
read -r -p "Restaurant ID [3]: " RESTAURANT_ID
RESTAURANT_ID="${RESTAURANT_ID:-3}"
read -r -p "Webhook URL (webhook.site): " WEBHOOK_URL

if [[ -z "$WEBHOOK_URL" ]]; then
  echo "Webhook URL is required (use https://webhook.site)"
  exit 1
fi

echo
echo "==> Admin login"
LOGIN_RESP=$(curl -sS -X POST "$BASE_URL/api/admin/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}")

ADMIN_TOKEN=$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(String(j?.data?.token||j?.token||""))' "$LOGIN_RESP")
if [[ -z "$ADMIN_TOKEN" ]]; then
  echo "Login failed:"
  echo "$LOGIN_RESP"
  exit 1
fi
echo "Admin token OK"

echo "==> Create POS API key"
KEY_RESP=$(curl -sS -X POST "$BASE_URL/api/admin/pos/api-keys" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"restaurant_id\":$RESTAURANT_ID,\"name\":\"Smoke POS\",\"provider\":\"verifone\",\"environment\":\"sandbox\",\"scopes\":[\"orders:read\",\"orders:write\"]}")

POS_TOKEN=$(node -e 'const j=JSON.parse(process.argv[1]); process.stdout.write(String(j?.data?.token||""))' "$KEY_RESP")
if [[ -z "$POS_TOKEN" ]]; then
  echo "Create API key failed:"
  echo "$KEY_RESP"
  exit 1
fi
echo "POS token created (save this):"
echo "$POS_TOKEN"

echo "==> Create POS connection"
CONN_RESP=$(curl -sS -X POST "$BASE_URL/api/admin/pos/connections" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"restaurant_id\":$RESTAURANT_ID,\"url\":\"$WEBHOOK_URL\",\"provider\":\"verifone\",\"external_merchant_id\":\"TEST-MERCHANT-001\",\"events\":[\"order.created\"],\"active\":true}")
echo "$CONN_RESP" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); console.log(j.status?("Connection id="+j.data.id):JSON.stringify(j,null,2));})'

echo
echo "==> List pending orders via POS token"
LIST_RESP=$(curl -sS "$BASE_URL/api/v1/pos/orders?status=pending&limit=5" \
  -H "Authorization: Bearer $POS_TOKEN")
echo "$LIST_RESP" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); if(!j.status){console.log(s); process.exit(1);} console.log("pending count in page:", (j.data||[]).length); (j.data||[]).forEach(o=>console.log("-", o.id, o.order_status, o.order_amount)); if(j.data?.[0]?.id) console.log("HINT_ORDER_ID="+j.data[0].id);})'

read -r -p "Order ID to accept (from list above): " ORDER_ID
if [[ -z "$ORDER_ID" ]]; then
  echo "No order id provided. Place a pending order for restaurant $RESTAURANT_ID and re-run."
  exit 0
fi

echo "==> GET order $ORDER_ID"
curl -sS "$BASE_URL/api/v1/pos/orders/$ORDER_ID" -H "Authorization: Bearer $POS_TOKEN" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); console.log(JSON.stringify(j,null,2));})'

echo "==> ACCEPT order $ORDER_ID"
ACCEPT_RESP=$(curl -sS -X POST "$BASE_URL/api/v1/pos/orders/$ORDER_ID/accept" \
  -H "Authorization: Bearer $POS_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{}')
echo "$ACCEPT_RESP" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); console.log(j.status?("OK status="+j.data.order_status):JSON.stringify(j,null,2));})'

echo "==> Deliveries for order"
curl -sS "$BASE_URL/api/admin/pos/deliveries?order_id=$ORDER_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const j=JSON.parse(s); console.log(JSON.stringify(j,null,2));})'

echo
echo "Done. Also check webhook.site for order.created (after a NEW order is placed)."
