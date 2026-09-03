# ==========================================
# Zaki AI CRM - Production Dockerfile
# Next.js + Prisma + PostgreSQL
# ==========================================

FROM node:24-alpine AS base

# ==========================================
# 1. Install dependencies
# ==========================================

FROM base AS deps

WORKDIR /app

RUN apk add --no-cache \
    libc6-compat \
    openssl

COPY package.json package-lock.json ./

RUN npm ci

COPY prisma ./prisma

# Generate Prisma Client
RUN ./node_modules/.bin/prisma generate


# ==========================================
# 2. Build application
# ==========================================

FROM base AS builder

WORKDIR /app

RUN apk add --no-cache \
    libc6-compat \
    openssl

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN ./node_modules/.bin/prisma generate

RUN npm run build


# ==========================================
# 3. Production Runner
# ==========================================

FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN apk add --no-cache \
    libc6-compat \
    openssl

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs


# ==========================================
# Copy Prisma and dependencies
# ==========================================

# IMPORTANT:
# Copy the COMPLETE node_modules including Prisma CLI
COPY --from=builder /app/node_modules ./node_modules

# Copy Prisma including migrations
COPY --from=builder /app/prisma ./prisma


# ==========================================
# Copy Next.js production files
# ==========================================

COPY --from=builder /app/public ./public

COPY --from=builder --chown=nextjs:nodejs \
    /app/.next/standalone ./

COPY --from=builder --chown=nextjs:nodejs \
    /app/.next/static ./.next/static


# ==========================================
# Permissions
# ==========================================

RUN chown -R nextjs:nodejs /app


# ==========================================
# Entrypoint
# ==========================================

COPY --chmod=755 docker-entrypoint.sh \
    /usr/local/bin/docker-entrypoint.sh


USER nextjs

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
