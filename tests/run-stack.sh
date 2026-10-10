#!/usr/bin/env bash
# Arranca el entorno local de pruebas (Postgres ya iniciado en :54322).
set -euo pipefail
cd "$(dirname "$0")/.."
export JWT_SECRET="local-test-secret-local-test-secret-1234"
DENO=${DENO:-/tmp/tools/deno}
PGRST_BIN=${PGRST_BIN:-/tmp/tools/postgrest}
P="psql -h /tmp/pg -p 54322 -U postgres -v ON_ERROR_STOP=1 -q"
pkill -f "postgrest" 2>/dev/null || true
pkill -f "tests/dev-server.js" 2>/dev/null || true
$P -c "drop database if exists wqv with (force)" -c "create database wqv"
for f in tests/supabase-stub.sql supabase/migrations/0001_schema.sql supabase/migrations/0002_storage.sql \
         supabase/migrations/0003_web_estatica.sql supabase/seed.sql ${FIXTURES:-tests/fixtures.sql}; do
  $P -d wqv -f "$f" >/dev/null 2>&1 || { echo "Fallo en $f"; $P -d wqv -f "$f"; exit 1; }
done
$P -d wqv -c "alter role authenticator password 'authenticator'" 
eval "$($DENO run -A tests/jwt.js)"
PGRST_DB_URI="postgres://authenticator:authenticator@127.0.0.1:54322/wqv" PGRST_DB_SCHEMAS=public \
  PGRST_DB_ANON_ROLE=anon PGRST_JWT_SECRET="$JWT_SECRET" PGRST_SERVER_PORT=3000 \
  nohup $PGRST_BIN > /tmp/pgrst.log 2>&1 &
TEST_PUBLIC_ANON=$ANON_KEY SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=$ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY \
  SITE_URL=http://127.0.0.1:8080 LEAD_SECRET=local-lead-secret-local-lead-secret-0000 \
  STRIPE_SECRET_KEY=sk_test_local STRIPE_WEBHOOK_SECRET=whsec_local STRIPE_API_BASE=http://127.0.0.1:54321/fake-stripe \
  RESEND_API_KEY=re_local EMAIL_FROM="Pruebas <hola@prueba.local>" ADMIN_NOTIFY_EMAIL=admin@prueba.local \
  RESEND_API_BASE=http://127.0.0.1:54321/fake-resend \
  TEST_USERS="11111111-1111-1111-1111-111111111111:admin@prueba.local:clave-admin-123,22222222-2222-2222-2222-222222222222:intruso@prueba.local:clave-intruso-123" \
  nohup $DENO run -A tests/dev-server.js > /tmp/dev-server.log 2>&1 &
echo "ANON_KEY=$ANON_KEY" > /tmp/wqv-keys.env
echo "SERVICE_KEY=$SERVICE_KEY" >> /tmp/wqv-keys.env
sleep 3
curl -sf http://127.0.0.1:54321/rest/v1/packages?select=slug -H "apikey: $ANON_KEY" >/dev/null && echo "Entorno listo"
