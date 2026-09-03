#!/bin/sh
set -e

echo "===== CHECKING PRISMA MIGRATIONS ====="
find /app/prisma -type f -print

echo "==> Applying Prisma migrations..."

./node_modules/.bin/prisma migrate deploy

echo "==> Starting application on port ${PORT:-3000}..."

exec node server.js
