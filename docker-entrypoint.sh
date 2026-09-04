#!/bin/sh
set -e

echo "========================================"
echo "SYNCING DATABASE WITH PRISMA"
echo "========================================"

npx prisma db push --schema=prisma/schema.prisma --accept-data-loss

echo "========================================"
echo "DATABASE READY"
echo "========================================"

exec "$@"
