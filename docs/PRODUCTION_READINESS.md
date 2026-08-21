# CarFlow Production Readiness

**Status:** Careful-production launch checklist complete in code. Staging signoff required before production SkipCash keys.

---

## Production stack

| Component | Service | Notes |
|-----------|---------|-------|
| Database | **Neon** Postgres | `DATABASE_URL` connection string |
| API | **Railway** (supported production target) | Long-lived Node (`node dist/index.js`); in-process scheduler + Sentry; Dockerfile deploy from monorepo root |
| Frontends | **Vercel** (3 projects) | Customer, Dealer, Admin — each with `vercel.json` SPA rewrites |
| Uploads | **Vercel Blob** | Required: `UPLOAD_DRIVER=blob` + `BLOB_READ_WRITE_TOKEN` (local disk refused at boot) |
| Email | **Resend** | Password reset, booking confirmation, email verification |
| Payments | **SkipCash** | Sandbox first, then production keys |

> **API on Vercel is deprecated.** `api/index.ts` / `apps/backend/vercel.json` do not run billing jobs or Sentry. Production must use **Railway**. The serverless entry only loads when `EXTERNAL_SCHEDULER=true` and an external cron calls `POST /api/admin/jobs/run-once` — not a supported launch topology.

```mermaid
flowchart LR
  CustomerApp[Customer Vercel] --> API[Express Railway]
  DealerApp[Dealer Vercel] --> API
  AdminApp[Admin Vercel] --> API
  API --> Neon[(Neon Postgres)]
  API --> Blob[Vercel Blob]
  API --> Resend[Resend]
  API --> SkipCash[SkipCash]
  SkipCash -->|webhook| API
```

---

## What is production-ready

### Money integrity
- Server computes SkipCash charge from `pricePerDay × 30 × durationMonths` (client `cart.total` ignored)
- Webhook reconciles `Amount` ±0.01 before creating bookings
- Paid-but-booking-failed payments flagged `needsRefund` for admin ops
- Admin `POST /api/admin/payments/:id/refund` + Payments UI action

### Privacy / IDOR
- Dealer customer documents require rental or booking relationship
- Upload `GET /documents/file` and `DELETE /by-url` enforce ownership (admin override)

### Auth / sessions
- Refresh sessions persisted with `jti`; revoked on logout, password change, admin suspend
- `requireAuth` rejects suspended profiles mid-session
- `SameSite=Lax; Secure` cookies with `COOKIE_DOMAIN=.yourdomain.tld` (recommended: api + app subdomains on one registrable domain)
- `SameSite=None; Secure` fallback when `COOKIE_DOMAIN` is unset (cross-origin; blocked as third-party in Safari/Chrome)
- Password min 8 + letter + number; weak JWT secrets refused at production boot

### Deploy / ops
- Multi-stage Dockerfile builds shared + backend to `dist/`
- Deploy workflow gated on full test suite (`workflow_call` to `test.yml`)
- Optional Sentry via `SENTRY_DSN`; production 500 responses sanitized

### Compliance / honesty
- Real `DELETE /api/customer/account` + PrivacySection wired
- Email verification email on signup; online pay gated on `emailVerifiedAt`
- Dealer `alert()` replaced with toasts; stub settings labeled unavailable
- Admin booking delete requires confirmation

### CI
- `.github/workflows/test.yml` — lint, typecheck, conventions, API (167 tests), E2E
- `.github/workflows/deploy.yml` — requires green tests before Railway/Vercel deploy

---

## Production environment checklist

```bash
# Database (Neon)
DATABASE_URL=postgresql://...

# JWT (rotate before launch — 32+ chars, not dev placeholders)
JWT_ACCESS_SECRET=<strong-random>
JWT_REFRESH_SECRET=<strong-random>
JWT_2FA_SECRET=<strong-random-distinct-from-above>
COOKIE_SECURE=true
COOKIE_DOMAIN=.carflow.qa

# API
PORT=8080
CORS_ORIGINS=https://customer.example.com,https://dealer.example.com,https://admin.example.com
PUBLIC_API_URL=https://api.example.com
CUSTOMER_APP_URL=https://customer.example.com

# Uploads
UPLOAD_DRIVER=blob
BLOB_READ_WRITE_TOKEN=...

# Background jobs (Railway — in-process scheduler on long-lived Node)
ENABLE_JOBS=true
# Set EXTERNAL_SCHEDULER=true only for legacy serverless API + external cron on POST /api/admin/jobs/run-once
# EXTERNAL_SCHEDULER=true

# Email
RESEND_API_KEY=...
FROM_EMAIL=noreply@yourdomain.com

# SkipCash (sandbox → production)
SKIPCASH_MODE=production
SKIPCASH_CLIENT_ID=...
SKIPCASH_KEY_ID=...
SKIPCASH_KEY_SECRET=...
SKIPCASH_WEBHOOK_KEY=...
# Portal paths (must be reachable on PUBLIC_API_URL): /skipcash-pay/callback, /skipcash-pay/return

# Optional observability
SENTRY_DSN=https://...

# Frontends (Vercel build env, per project)
VITE_API_URL=https://api.example.com/api
VITE_USE_MOCK_API=false
```

**Never run `db:seed` in production.**

---

## SkipCash configuration

> **SECURITY NOTE (added by remediation):** earlier revisions of this file
> committed real SkipCash client ids, key ids, and webhook keys. Treat every
> one of those values as compromised: rotate them in the SkipCash merchant
> portal and scrub this file from git history before launch. Production boot
> now refuses the previously committed webhook keys.


Create-intent sends `ReturnUrl` and `WebhookUrl` on each payment (overrides portal defaults when set). Routes are mounted at both `/skipcash-pay/*` (portal paths) and `/api/payments/skipcash/*` (legacy/tests).

| Setting | Sandbox (test) | Production (www.carflow.qa) |
|---------|----------------|----------------------------|
| `SKIPCASH_MODE` | `sandbox` | `production` |
| `SKIPCASH_CLIENT_ID` | `<sandbox client id — from SkipCash portal>` | `<production client id — from SkipCash portal>` |
| `SKIPCASH_KEY_ID` | `<sandbox key id — from SkipCash portal>` | `<production key id — from SkipCash portal>` (enabled Card Checkout) |
| `SKIPCASH_KEY_SECRET` | From portal Copy Key | From portal Copy Key — **host secrets only** |
| `SKIPCASH_WEBHOOK_KEY` | `<sandbox webhook key — from SkipCash portal>` | `<production webhook key — ROTATE: previous value was committed>` |
| Portal webhook | `http://test.carflow.4livedemo.com/skipcash-pay/callback` | `https://www.carflow.qa/skipcash-pay/callback` |
| Portal return | `http://test.carflow.4livedemo.com/skipcash-pay/return` | `https://www.carflow.qa/skipcash-pay/return` |

**Local dev:** set sandbox vars in gitignored `.env`. SkipCash cannot POST webhooks to `localhost` — use the deployed test host (`test.carflow.4livedemo.com`) or an HTTPS tunnel, and set `PUBLIC_API_URL` to that public origin.

**Production deploy (Railway):** set production `SKIPCASH_*` via Railway service variables (never in local `.env`). If the API runs on a separate host from `www.carflow.qa`, either proxy `/skipcash-pay/*` to the API or set `PUBLIC_API_URL` to the API origin that mounts these routes.

```powershell
# Example Railway service variables (paste full KEY_SECRET from portal)
railway service carflow-api
railway variable set `
  SKIPCASH_MODE=production `
  SKIPCASH_CLIENT_ID=<production client id — from SkipCash portal> `
  SKIPCASH_KEY_ID=<production key id — from SkipCash portal> `
  SKIPCASH_KEY_SECRET='...' `
  SKIPCASH_WEBHOOK_KEY=<production webhook key — ROTATE: previous value was committed> `
  PUBLIC_API_URL=https://www.carflow.qa `
  CUSTOMER_APP_URL=https://www.carflow.qa
```

---

## Staging go / no-go (run before production keys)

| Check | Pass |
|-------|------|
| Secrets rotated; no `dev-*-change-me` JWT values | ☐ |
| `COOKIE_SECURE=true` + `COOKIE_DOMAIN=.carflow.qa` (optional until custom domain); login works from customer/dealer/admin Vercel origins against Railway API | ☐ |
| `GET /health` returns `"db":"connected"`; Railway service stays online after deploy | ☐ |
| SkipCash sandbox: create-intent → webhook at `/skipcash-pay/callback` → booking → dealer approve → rental | ☐ |
| SkipCash keys **rotated in merchant portal** after any doc/history exposure (production boot refuses old webhook keys) | ☐ |
| Admin refund flow for a `needsRefund` payment (or manual note path) | ☐ |
| IDOR regression: cross-dealer document access denied (API tests green) | ☐ |
| Pricing regression: client `total: 1` cannot underpay (PAY-04b green) | ☐ |
| Suspend user mid-session returns 403 on next request (RACE-07 green) | ☐ |
| Account delete removes profile; blocked with active rental | ☐ |
| Email verify link → `/verify-email` → online checkout allowed | ☐ |
| CI green on main; deploy workflow blocked on red tests | ☐ |
| Sentry receiving a test error (if `SENTRY_DSN` set) | ☐ |

**Go:** flip SkipCash to production keys and re-run one real payment in staging.  
**No-go:** any money, auth, or IDOR check fails — fix before cutover.

---

## Deploy steps

1. Create Neon database; set `DATABASE_URL` on Railway
2. `npm run db:migrate --workspace=apps/backend` against Neon (or deploy workflow migrate job)
3. Set Railway variables — include `UPLOAD_DRIVER=blob`, `ENABLE_JOBS=true`, and all secrets from the checklist above
4. Tag release: `git tag v1.0.0 && git push origin v1.0.0` (triggers deploy workflow after tests pass)
5. Create three Vercel projects pointing at `apps/customer`, `apps/dealer`, `apps/admin` (frontends only — not the API)
6. Configure GitHub secrets: `RAILWAY_TOKEN`, `RAILWAY_SERVICE_ID`, `VERCEL_*`, `DATABASE_URL`, `PUBLIC_API_URL`
7. Complete staging go/no-go checklist above
8. Switch SkipCash from sandbox to production keys

Do **not** deploy the API with `apps/backend/vercel.json` or `npm run deploy:vercel:api` (removed). **Railway** is the supported production API target.

---

## Intentional post-launch (enterprise backlog)

Tracked in `tests/gap-registry.json`: Stripe, 2FA, SMS verify, rental extensions, reviews, i18n/RTL, dealer AI analytics, fleet ops.

---

## Verdict

CarFlow is **ready for careful production launch** after staging signoff on Neon + Railway + Vercel with SkipCash sandbox fully green, then production payment keys.
