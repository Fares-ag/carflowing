# Multi-stage production build for CarFlow Express API (monorepo workspace)
# Build context: repository root (see railway.toml / railway.json)

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
RUN npm ci --omit=dev --workspace=@carflow/backend --workspace=@carflow/shared
COPY --from=build /app/apps/backend/dist ./apps/backend/dist
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/backend/drizzle ./apps/backend/drizzle
COPY scripts/rewrite-shared-package-exports.cjs ./scripts/rewrite-shared-package-exports.cjs
COPY scripts/verify-shared-production-exports.mjs ./scripts/verify-shared-production-exports.mjs
RUN node ./scripts/rewrite-shared-package-exports.cjs ./packages/shared/package.json
# Fail the image build if any published subpath cannot be imported in production.
RUN node ./scripts/verify-shared-production-exports.mjs

WORKDIR /app/apps/backend
RUN mkdir -p /app/apps/backend/uploads && chown -R nodejs:nodejs /app/apps/backend /app/packages/shared
USER nodejs
EXPOSE 8080
ENV PORT=8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=8 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
