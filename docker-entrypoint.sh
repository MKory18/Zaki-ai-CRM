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

# The scheduled jobs. They used to run only when somebody pressed "run" on
# the jobs screen, because nothing in production ever started the worker:
# held orders were never released to the pool, courier statuses never
# synced, webhooks and Meta conversions sat in their queues, commission was
# never accrued and no reminder was ever sent.
#
# It runs beside the web server in this same container, so a deployment
# needs nothing new configured. The loop restarts it if it ever exits, and
# every job already takes a database lock, so a second worker elsewhere
# would skip rather than run twice. RUN_WORKER=false turns it off here —
# for when it runs as its own service instead.
if [ "${RUN_WORKER:-true}" = "true" ]; then
  echo "Starting scheduler worker (RUN_WORKER=false to disable)"
  (
    while true; do
      ./node_modules/.bin/tsx scripts/worker.ts || echo "worker exited ($?) - restarting in 10s"
      sleep 10
    done
  ) &
fi

exec node server.js
