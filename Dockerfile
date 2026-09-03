FROM node:24-alpine AS base

# =========================
# Dependencies
# =========================
FROM base AS deps

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/

RUN npm ci

RUN ./node_modules/.bin/prisma generate


# =========================
# Build
# =========================
FROM base AS builder

RUN apk add --no-cache libc6-compat openssl

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN ./node_modules/.bin/prisma generate

RUN npm run build


# =========================
# Production
# =========================
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache libc6-compat openssl

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs


COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# نسخ node_modules بالكامل لضمان Prisma CLI
COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static


# فحص مهم جداً لمعرفة هل migration.sql وصل للـ Container
RUN echo "===== PRISMA FILES =====" && \
    find /app/prisma -type f -print


COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
