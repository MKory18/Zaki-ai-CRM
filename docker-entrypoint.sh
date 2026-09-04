#!/bin/sh
set -e

echo "========================================"
echo "APPLYING PRISMA MIGRATIONS"
echo "========================================"

# Fails hard (and Coolify restarts the container) if DATABASE_URL is wrong,
# migrations are broken, or the database is unreachable.
./node_modules/.bin/prisma migrate deploy

echo ""
echo "========================================"
echo "STARTING ZAKI AI CRM"
echo "========================================"

# Optional: seed demo/reference data only when explicitly requested
if [ "$SEED_DATABASE" = "true" ]; then
  echo "SEED_DATABASE=true -> running seed..."
  ./node_modules/.bin/tsx prisma/seed.ts || echo "Seed failed (continuing)."
fi

exec node server.js
