#!/bin/sh
# Local Stripe sidecar (runs in the stripe/stripe-cli image; no Bun/Node).
#
# Reads STRIPE_SECRET_KEY from the bind-mounted web .dev.vars, ensures the byos3 product + USD
# monthly/annual prices exist in the connected Stripe SANDBOX (idempotent, keyed by metadata), writes
# the resulting price IDs + the webhook signing secret back into .dev.vars, then forwards webhook
# events to the web container. If no key is set, it exits 0 so core local dev still works without
# Stripe. Prices MUST stay in sync with PRICE_CENTS in packages/protocol/src/billing.ts.
set -eu

DEV_VARS=/app/workspaces/apps/web/.dev.vars
WEBHOOK_PATH=/api/auth/stripe/webhook
WEB_URL=http://web:4500

# Amounts in cents, USD (mirror packages/protocol/src/billing.ts PRICE_CENTS).
MONTHLY_CENTS=300
ANNUAL_CENTS=3000

read_var() { sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}.*/\1/p" "$DEV_VARS" 2>/dev/null | head -1; }

STRIPE_KEY=$(read_var STRIPE_SECRET_KEY)
if [ -z "$STRIPE_KEY" ]; then
  echo "STRIPE_SECRET_KEY not set in $DEV_VARS - Stripe disabled for this dev session."
  exit 0
fi
API="--api-key $STRIPE_KEY"

extract_id() { sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1; }

ensure_product() {
  EXISTING=$(stripe get /v1/products/search $API -d "query=metadata['byos3_plan']:'byos3'" -d limit=1 2>/dev/null | extract_id)
  if [ -n "$EXISTING" ]; then echo "$EXISTING"; return; fi
  stripe post /v1/products $API \
    -d "name=byos3" -d "description=byos3 - bring-your-own-S3 file sync (per seat)" \
    -d "metadata[byos3_plan]=byos3" 2>/dev/null | extract_id
}

# ensure_price <key> <product> <cents> <month|year>
ensure_price() {
  EXISTING=$(stripe get /v1/prices/search $API -d "query=metadata['byos3_price']:'$1'" -d limit=1 2>/dev/null | extract_id)
  if [ -n "$EXISTING" ]; then echo "$EXISTING"; return; fi
  stripe post /v1/prices $API \
    -d "product=$2" -d currency=usd -d "unit_amount=$3" \
    -d "recurring[interval]=$4" -d "recurring[interval_count]=1" \
    -d "metadata[byos3_price]=$1" 2>/dev/null | extract_id
}

set_var() {
  if grep -q "^$2=" "$1" 2>/dev/null; then
    sed -i "s|^$2=.*|$2=\"$3\"|" "$1"
  else
    echo "$2=\"$3\"" >> "$1"
  fi
}

echo "Ensuring byos3 Stripe product + prices (USD)..."
PRODUCT=$(ensure_product)
PRICE_MONTHLY=$(ensure_price monthly "$PRODUCT" "$MONTHLY_CENTS" month)
PRICE_ANNUAL=$(ensure_price annual "$PRODUCT" "$ANNUAL_CENTS" year)
echo "  product: $PRODUCT"
echo "  monthly: $PRICE_MONTHLY  annual: $PRICE_ANNUAL"

set_var "$DEV_VARS" STRIPE_PRICE_MONTHLY "$PRICE_MONTHLY"
set_var "$DEV_VARS" STRIPE_PRICE_ANNUAL "$PRICE_ANNUAL"

SECRET=$(stripe listen --print-secret $API)
set_var "$DEV_VARS" STRIPE_WEBHOOK_SECRET "$SECRET"
echo "  webhook secret: ${SECRET%${SECRET#????????????}}..."

echo "Forwarding Stripe webhooks to $WEB_URL$WEBHOOK_PATH"
exec stripe listen $API --forward-to "$WEB_URL$WEBHOOK_PATH"
