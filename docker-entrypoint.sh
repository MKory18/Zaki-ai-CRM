#!/bin/sh
set -e

echo "==> Applying Prisma migrations (deploy, safe & idempotent)..."
npx prisma migrate deploy

echo "==> Starting Zaki AI Store on 0.0.0.0:${PORT:-3000}..."
exec node server.js
