# Multi-stage production build for CarFlow Express API (monorepo workspace)
# Build context: repository root (see fly.toml build-context)

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace=@carflow/backend --workspace=@carflow/shared

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci --workspace=@carflow/backend --workspace=@carflow/shared
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend
RUN npm run build --workspace=@carflow/shared
RUN npm run build --workspace=@carflow/backend

FROM node:20-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app

RUN addgroup -g 1001 nodejs && adduser -S nodejs -u 1001

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY packages/shared/package.json ./packages/shared/
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
RUN npm pkg set main=./dist/index.js --workspace=@carflow/shared \
  && npm pkg set types=./dist/index.d.ts --workspace=@carflow/shared
COPY packages/shared/package.json ./packages/shared/package.json
COPY apps/backend/package.json ./apps/backend/package.json

WORKDIR /app/apps/backend
USER nodejs
EXPOSE 8080
ENV PORT=8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["node", "dist/index.js"]
