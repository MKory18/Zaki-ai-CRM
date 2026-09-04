#!/bin/sh

set -e

echo "========================================"
echo "CHECKING PRISMA MIGRATIONS"
echo "========================================"

ls -la /app/prisma/migrations/0_init || true

echo ""

echo "========================================"
echo "APPLYING PRISMA MIGRATIONS"
echo "========================================"

./node_modules/.bin/prisma migrate deploy

echo ""

echo "========================================"
echo "STARTING ZAKI AI CRM"
echo "========================================"

exec node server.js
