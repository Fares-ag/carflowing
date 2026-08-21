# CarFlow Business Use Case Audit

Scenario checklist for the **current** CarFlow stack: three Vite frontends (`apps/customer`, `apps/dealer`, `apps/admin`) backed by **Express + Drizzle ORM** on **Postgres (Neon locally or hosted)**.

> **Note:** An earlier version of this document referenced Supabase Auth, RLS, and edge functions. That backend was replaced; all persistence and authorization now go through `apps/backend` REST routes and middleware (`requireAuth`, `requireRole`, admin RBAC).

---

## Legend

| Symbol | Meaning |
|--------|---------|
| OK | Implemented end-to-end against the Express API |
| PARTIAL | UI or API exists but incomplete vs product spec |
| MISSING | Not implemented |
| BUG | Known incorrect behavior |

---

## Stack reference

| Concern | Implementation |
|---------|----------------|
| Auth | `POST /api/auth/login`, httpOnly JWT cookies, email verification, 2FA optional |
| Customer data | `/api/customer/*` routes + Drizzle queries |
| Dealer data | `/api/dealer/*` |
| Admin / RBAC | `/api/admin/*` with role checks (`admin`, `finance`, `ops`, `support`) |
| Uploads | `POST /api/uploads/document`, local disk or Vercel Blob |
| Payments | SkipCash (`/api/payments/skipcash/*`), offline pay-at-shop on booking |
| Billing / subscriptions | In-process jobs (`scheduler.ts`), invoices, dunning |
| Email | Resend via outbox (`emailOutbox.ts`) when configured |

Seed accounts (after `npm run db:seed`): `customer@carflow.dev`, `dealer@carflow.dev`, `admin@carflow.dev` — password `password123`.

---

## PART 1 — Customer app

### Sign up & login

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Sign up | Account + customer profile | OK | `POST /api/auth/signup`; verification email when Resend configured |
| Login | Cookie session, role = customer | OK | Empty login form; redirect preserves `?redirect=` |
| Protected routes | Checkout, my-booking, settings | OK | `@carflow/shared` `ProtectedRoute` |

### Browse & book

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Catalog | List available vehicles | OK | `GET /api/customer/vehicles` (public catalog) |
| Car detail | `/car/:id` configure rental | OK | Cart in Zustand; pricing via shared helpers |
| Checkout | Identity docs + booking request | OK | QID validation; uploads via API |
| Pay at shop | Pending booking, dealer approves | OK | `POST /api/customer/booking-requests` |
| SkipCash | Online first-month charge + hold | OK | Create-intent + webhook settlement; see payment routes |
| My booking | Requests + rentals in one view | OK | `/my-booking`; legacy dashboard pages removed |

### Account

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Saved cars | Favorites in settings | OK | `/settings?section=saved` |
| Billing | Invoices & payment methods | OK | `/settings?section=billing` |
| Notifications / messages | In-app lists | OK | Protected routes wired to API |

---

## PART 2 — Dealer app

| Area | Status | Detail |
|------|--------|--------|
| Dashboard & analytics | OK | Aggregates via `/api/dealer/*`; charts on Dashboard/Analytics pages |
| Inventory | OK | CRUD vehicles for logged-in dealer |
| Booking requests | OK | Approve/decline with notes |
| Leads CRM | OK | Lead list + add lead UI |
| Offline payment recording | OK | Dealer can record pay-at-shop completion |

---

## PART 3 — Admin app

| Area | Status | Detail |
|------|--------|--------|
| Dashboard KPIs | OK | Platform counts via SQL aggregates |
| Customers | OK | List, suspend/activate, document access |
| Dealers & cars | OK | Admin-on-behalf CRUD |
| Booking requests | OK | Approve/decline |
| Payments & refunds | OK | Admin payment routes + SkipCash reconciliation |
| Promos, payouts, jobs, audit | OK | See admin feature routes and pages |

---

## Verification commands

```bash
npm run db:push && npm run db:seed
npm run test --workspace=apps/backend
npm run test --workspace=apps/customer
npm run test --workspace=apps/dealer
npm run test --workspace=apps/admin
npm run test:e2e
```

For flow walkthrough steps, see **`docs/FLOW_AND_VERIFICATION.md`**.

---

## Historical note

Pre-Express prototypes (root `src/` Figma tool, `supabase/` SQL/edge functions, unrouted customer pages such as `ShoppingCartPage` and `Dashboard`) have been **removed**. Do not use Supabase setup docs for this repository.
