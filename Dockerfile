# ==========================================
# Zaki AI CRM - Production Dockerfile
# ==========================================

FROM node:24-alpine AS base


# ==========================================
# Dependencies
# ==========================================

FROM base AS deps

WORKDIR /app

RUN apk add --no-cache \
    libc6-compat \
    openssl

# نسخ package files
COPY package.json package-lock.json ./

# مهم جداً: نسخ Prisma قبل npm ci
# لأن postinstall يشغل prisma generate
COPY prisma ./prisma/

# تثبيت Dependencies
RUN npm ci

# Generate Prisma Client
RUN ./node_modules/.bin/prisma generate


# ==========================================
# Build
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
# Production
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

# إنشاء المستخدم
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs


# ==========================================
# Prisma + Dependencies
# ==========================================

# نسخ node_modules
COPY --from=builder /app/node_modules ./node_modules

# نسخ Prisma بالكامل مع migrations
COPY --from=builder /app/prisma ./prisma


# ==========================================
# Next.js
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
