# Production Dockerfile for Zaki AI CRM (Next.js standalone + Prisma PostgreSQL)

FROM node:24-alpine AS base

# ========================================
# Dependencies
# ========================================

FROM base AS deps

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY package.json package-lock.json ./

# Copy Prisma schema BEFORE npm ci because the postinstall hook runs `prisma generate`
COPY prisma ./prisma

RUN npm ci

# ========================================
# Builder
# ========================================

FROM base AS builder

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV JWT_SECRET=build-time-secret-not-used-in-production

# prisma generate + next build (via package.json build script)
RUN npm run build

# ========================================
# Production Runner
# ========================================

FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache libc6-compat openssl

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy static/public assets
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy the standalone server FIRST (it contains its own trimmed node_modules)
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy Prisma schema + migrations for `migrate deploy` at container start
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

# Copy the FULL node_modules (superset of standalone's) so the prisma CLI
# is available for migrations. Copied AFTER standalone on purpose.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules

# Writable uploads directory for local product image storage
RUN mkdir -p /app/uploads && chown -R nextjs:nodejs /app/uploads

# Copy entrypoint
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER nextjs

EXPOSE 3000

  CMD wget -qO- http://127.0.0.1:3000/login >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
