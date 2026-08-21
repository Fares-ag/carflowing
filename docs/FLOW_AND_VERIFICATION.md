# CarFlow Customer Flow & Verification

This document describes the **current** customer app flow against the **Express + Neon/Postgres (Drizzle)** backend. Legacy Supabase/RLS documentation has been removed; the runtime API lives in `apps/backend`.

## Architecture (current)

| Layer | Location | Notes |
|-------|----------|-------|
| Customer UI | `apps/customer` | Vite + React; calls `/api/*` via `@carflow/shared` `apiClient` |
| Backend API | `apps/backend` | Express routes under `/api/customer`, `/api/auth`, `/api/uploads`, `/api/payments` |
| Database | Neon or local Postgres | Drizzle schema in `apps/backend/src/db/schema.ts`; migrations in `apps/backend/drizzle/` |
| Auth | httpOnly cookies | JWT access + refresh; `ProtectedRoute` in each app |
| File uploads | `POST /api/uploads/document` | QID + driver's license required before checkout |
| Online pay | SkipCash sandbox/production | `POST /api/payments/skipcash/create-intent`; webhook at `/skipcash-pay/callback` |

## Main customer flow

1. **Home** (`/`) → Featured cars and marketing.
2. **Browse** (`/browse`) → Filter/sort catalog; **Book** opens car detail (`/car/:id`).
3. **Car detail** → Configure duration/dates in cart store; **Continue to checkout** (requires login).
4. **Checkout** (`/checkout`) — **protected (customer only)**:
   - Contact, QID number, license, address, emergency contact.
   - Upload QID + driver's license (or use documents already on file via API).
   - Payment: **Pay at pickup** (`createBookingRequest`) or **SkipCash online** (redirect to gateway; booking held until webhook).
5. **My booking** (`/my-booking`) → Single hub for pending requests and active rentals (legacy `/dashboard`, `/requests`, `/rentals`, `/cart` redirect here or to browse/settings).
6. **Account settings** (`/settings`) → Profile, saved cars (`?section=saved`), billing (`?section=billing`), security, etc.
7. **Payment status** (`/payment-status?paymentId=…`) → Polls SkipCash payment after gateway return.

## Local setup

1. Copy `.env.example` → `.env` at monorepo root.
2. Start Postgres: `npm run db:up` (Docker) or set `DATABASE_URL` to Neon.
3. Apply schema: `npm run db:push` and seed: `npm run db:seed`.
4. Run apps: `npm run dev:backend` and `npm run dev:customer` (or `npm run dev` for all workspaces).

Required env (minimum): `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `CORS_ORIGINS`, `PUBLIC_API_URL`. For SkipCash online pay in non-local environments, configure `SKIPCASH_*` keys (see `.env.example`).

## How to verify

1. **Customer app** (http://localhost:5173):
   - **Public**: Home, Browse, Contact, FAQs, Login, Sign up.
   - **Book flow**: Browse → Book → Checkout; unauthenticated users redirect to `/login?redirect=/checkout`.
   - **Checkout**: Complete fields, upload docs, submit with pay-at-shop → `/my-booking` shows pending request.
   - **Settings**: `/settings`, `/settings?section=saved`, `/settings?section=billing`.
2. **API smoke**: `GET http://localhost:3001/health` → `{ status: "ok", db: "connected" }`.
3. **Automated**: `npm run test --workspace=apps/backend`, `npm run test --workspace=apps/customer`, and `npm run test:e2e` (Playwright).

## Redirects (legacy URLs)

| Old path | Current behavior |
|----------|------------------|
| `/cart` | → `/browse` |
| `/dashboard`, `/requests`, `/rentals`, `/booking-confirmed` | → `/my-booking` |
| `/favorites`, `/billing` | → `/settings?section=saved` or `?section=billing` |

## Related docs

- `README.md` — monorepo scripts and deployment
- `docs/BUSINESS_USE_CASE_AUDIT.md` — scenario checklist against the Express backend
- `docs/PRODUCTION_READINESS.md` — production guards and SkipCash configuration
