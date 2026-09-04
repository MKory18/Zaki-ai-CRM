# Production Dockerfile for Zaki AI CRM

FROM node:24-alpine AS base

# ========================================
# Dependencies
# ========================================

FROM base AS deps

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY package.json package-lock.json ./

# IMPORTANT:
# Copy Prisma BEFORE npm ci because postinstall runs prisma generate
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

RUN npx prisma generate

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

# Create application user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs


# Copy public files
COPY --from=builder /app/public ./public

# Copy Prisma completely
COPY --from=builder /app/prisma ./prisma

# Copy Prisma runtime and CLI dependencies
COPY --from=builder /app/node_modules ./node_modules


# Copy Next.js standalone application
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static files
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static


# Copy entrypoint
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh


# Use non-root user
USER nextjs

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
