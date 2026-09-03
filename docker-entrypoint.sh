#!/bin/sh

set -e

echo "========================================"
echo "CHECKING PRISMA FILES"
echo "========================================"

ls -la /app/prisma
echo ""

ls -la /app/prisma/migrations
echo ""

ls -la /app/prisma/migrations/0_init
echo ""

echo "Migration file size:"
wc -c /app/prisma/migrations/0_init/migration.sql

echo ""
echo "========================================"
echo "PRISMA VERSION"
echo "========================================"

./node_modules/.bin/prisma --version

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
