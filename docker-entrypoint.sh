#!/bin/sh

set -e

echo "==> Applying Prisma migrations (deploy, safe & idempotent)..."

./node_modules/.bin/prisma migrate deploy

echo "==> Starting Zaki AI CRM on 0.0.0.0:${PORT:-3000}..."

exec node server.js
