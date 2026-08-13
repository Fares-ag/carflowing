# CarFlow Monorepo

CarFlow platform: **Admin**, **Customer**, and **Dealer** Vite apps plus an Express API (`apps/backend`).

## Stack

| Layer | Tech |
|-------|------|
| Database | PostgreSQL (Docker locally, Neon in production) via Drizzle |
| Auth | JWT in httpOnly cookies + RBAC (`admin` / `dealer` / `customer`) |
| Uploads | Local disk in dev, Vercel Blob in production |
| Frontends | React 18 + TypeScript + Vite |

## Prerequisites

- Node.js 18+
- Docker (for local Postgres)

## Setup

```bash
# 1. Env
cp .env.example .env

# 2. Install
npm install

# 3. Start Postgres
# Preferred: Docker
npm run db:up

# Or use local Postgres 16/17: create role/db then set DATABASE_URL
#   "C:\Program Files\PostgreSQL\17\bin\psql.exe" -U postgres -f apps/backend/src/db/create-db.sql

# 4. Push schema + seed demo users
npm run db:push
npm run db:seed
```

Demo accounts (password `password123`):
- `admin@carflow.dev`
- `dealer@carflow.dev`
- `customer@carflow.dev`

> If `db:push` fails with `ECONNREFUSED`, Postgres is not listening on `localhost:5432`. Start Docker Desktop and run `npm run db:up`, or enable TCP in your local Postgres `postgresql.conf` (`listen_addresses = '*'` / `localhost`) and restart the service.

## Development

```bash
# API (required)
npm run dev:backend
# http://localhost:3001

# Frontends
npm run dev:customer   # http://localhost:5173
npm run dev:admin      # http://localhost:5174
npm run dev:dealer     # http://localhost:5175
```

Vite proxies `/api` and `/uploads` to the backend.

## Production notes

See [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) for the full launch checklist.

- Set `DATABASE_URL` to your Neon connection string
- Set strong `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`
- Set `COOKIE_SECURE=true` behind HTTPS
- Set `UPLOAD_DRIVER=blob` and `BLOB_READ_WRITE_TOKEN`
- Set `CORS_ORIGINS` to your three Vercel frontend origins
- Set `PUBLIC_API_URL`, `CUSTOMER_APP_URL`, and SkipCash / Resend keys on Fly.io
- Per Vercel project: `VITE_API_URL=https://api.yourdomain.com/api`, `VITE_USE_MOCK_API=false`
- Deploy API: `cd apps/backend && fly deploy` (see `fly.toml` + `Dockerfile`)
- Run migrations: `npm run db:migrate` (uses `apps/backend/drizzle/`)
- Tag release `v*` to trigger `.github/workflows/deploy.yml`

## Testing

Automated tests cover API integration, unit/component tests, E2E flows, conventions, and documented product gaps.

```bash
npm run test              # all workspace unit/component/API tests
npm run test:api          # backend integration only (embedded Postgres)
npm run test:conventions  # architecture/security convention checks
npm run test:gaps         # gap registry validation
npm run test:e2e          # Playwright (starts backend + 3 Vite apps)
npm run lint:strict       # ESLint with zero warnings (root)
npm run typecheck         # TypeScript build across workspaces
```

**Seed credentials for E2E/manual QA** (password `password123`):

| Role | Email |
|------|-------|
| Admin | `admin@carflow.dev` |
| Dealer | `dealer@carflow.dev` |
| Customer | `customer@carflow.dev` |

**Conventions**

- API tests: `apps/backend/src/routes/__tests__/*.test.ts`
- Component tests: `apps/*/src/**/__tests__/*`
- E2E: `e2e/<app>/<feature>.spec.ts`
- Gap registry: `tests/gap-registry.json` (tag failing assertions with `@gap` until fixed)

## Legacy

The `supabase/` folder is archived reference SQL/edge functions from the previous backend. The runtime no longer depends on Supabase.
