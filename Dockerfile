# Production Dockerfile for Zaki AI CRM
# Next.js + Prisma + PostgreSQL

FROM node:24-alpine AS base

# ============================================================
# 1. Dependencies
# ============================================================

FROM base AS deps

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci --prefer-offline || npm install

RUN npx prisma generate


# ============================================================
# 2. Build Application
# ============================================================

FROM base AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npx prisma generate

RUN npm run build


# ============================================================
# 3. Production Runner
# ============================================================

FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN apk add --no-cache openssl libc6-compat

# Create secure application user
RUN addgroup --system --gid 1001 nodejs

RUN adduser --system --uid 1001 nextjs


# ------------------------------------------------------------
# Application files
# ------------------------------------------------------------

COPY --from=builder /app/public ./public

COPY --from=builder /app/prisma ./prisma

# IMPORTANT:
# Copy the complete local Prisma installation
COPY --from=builder /app/node_modules ./node_modules

# Next.js standalone application
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static


# ------------------------------------------------------------
# Startup script
# ------------------------------------------------------------

COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh


# ------------------------------------------------------------
# Security
# ------------------------------------------------------------

USER nextjs


EXPOSE 3000


ENTRYPOINT ["docker-entrypoint.sh"]
