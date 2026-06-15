#!/bin/bash
set -e
CF_TOKEN="$1"
CF_ACCOUNT="eb1fb7cd6098540c1c3cb764fea33f8e"

echo "=== Building frontend ==="
cd web && npm ci && npm run build && cd ..

echo "=== Creating R2 bucket ==="
EXISTS=$(curl -sf "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/r2/buckets" \
  -H "Authorization: Bearer $CF_TOKEN" \
  | python3 -c "import sys,json; print(any(b['name']=='r2-gallery' for b in json.load(sys.stdin).get('result',{}).get('buckets',[])))" 2>/dev/null || echo False)
if [ "$EXISTS" != "True" ]; then
  curl -sf -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/r2/buckets" \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json" -d '{"name":"r2-gallery"}' > /dev/null
  echo "Created"
else
  echo "Exists"
fi

echo "=== Creating D1 database ==="
DBS=$(curl -sf "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/d1/database" \
  -H "Authorization: Bearer $CF_TOKEN")
DB_ID=$(echo "$DBS" | python3 -c "import sys,json;print(next((r['uuid'] for r in json.load(sys.stdin).get('result',[]) if r['name']=='r2-gallery-db'),''))" 2>/dev/null)
if [ -z "$DB_ID" ]; then
  RESP=$(curl -sf -X POST "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT/d1/database" \
    -H "Authorization: Bearer $CF_TOKEN" \
    -H "Content-Type: application/json" -d '{"name":"r2-gallery-db"}')
  DB_ID=$(echo "$RESP" | python3 -c "import sys,json;print(json.load(sys.stdin)['result']['uuid'])")
fi
echo "D1 ID: $DB_ID"

echo "=== Updating wrangler.toml ==="
sed -i "s/YOUR_D1_DATABASE_ID/$DB_ID/" wrangler.toml

echo "=== Running migrations ==="
npx wrangler d1 execute r2-gallery-db --remote --file=./migrations/0001_init.sql

echo "=== Deploying ==="
npx wrangler deploy

echo "=== DONE ==="
