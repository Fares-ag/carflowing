# CarFlow — Cursor Composer 2.5 Fix Prompts

Derived from the production-readiness audit (commit `3094da1`). Prompts are ordered by priority. **Run one at a time**, review the diff, run the test suite (`npm run test:api` + `npm run test`), then move on. Do not paste them all at once — Composer does its best work on one scoped change set.

> Repo layout it should know: Express API in `apps/backend`, three Vite React apps in `apps/customer|dealer|admin`, shared code in `packages/shared`. No `zod` is used yet (it's a declared dep). Auth is JWT in httpOnly cookies. DB is Drizzle/Postgres; SQL invariants live in `apps/backend/src/db/bootstrap.sql`.

---

## ⚠️ P0 items Composer CANNOT do (you must do these by hand)

These are not code changes — don't ask an AI to "fix" them:

1. **Rotate secrets.** Rotate all SkipCash sandbox + production `CLIENT_ID` / `KEY_ID` / `KEY_SECRET` / `WEBHOOK_KEY` in the SkipCash merchant portal. Generate strong new `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`. Scrub the previously-committed keys from git history (`git filter-repo` / BFG).
2. **Reconcile source.** Commit and push the ~513-file working tree, protect `main`, and make tag → `deploy.yml` the only production deploy path. Stop deploying from the laptop (`scripts/setup-live-api.ps1`).
3. **Stand up one reachable API host** answering `/skipcash-pay/callback` with 200, then register the SkipCash webhook against that host. Set up DNS: `api.carflow.qa` + app subdomains.
4. **Delete demo accounts** (`*@carflow.dev` / `password123`) from the production Neon DB and never run `db:seed` against prod.
5. **Verify Neon** has migrations 0000–0007 + all partial-unique indexes applied, and enable + test PITR restore.

Prompt **P0-1** below makes the *code* stop enabling these problems (single entrypoint, force blob uploads, refuse to boot when misconfigured). The manual steps above still have to happen.

---

## PHASE 0 — Launch blockers (code)

### P0-1 · Single backend entrypoint + guarantee the scheduler runs

```
Context: The backend has two boot paths that behave differently. apps/backend/src/index.ts calls startScheduler() and initObservability(); api/index.ts (the Vercel serverless entry) calls only createApp() — so on Vercel the billing scheduler, dunning, webhook reconciliation, hold release, and payouts never run. scripts/setup-live-api.ps1 also sets ENABLE_JOBS=false and UPLOAD_DRIVER=local.

Task: Make Fly/long-lived Node the single supported production topology.
1. In apps/backend/src/utils/productionGuards.ts, change the UPLOAD_DRIVER check so production HARD-FAILS (throws) when UPLOAD_DRIVER !== 'blob' — remove the VERCEL=1 warn-only carve-out entirely.
2. Add a production guard that throws at boot if ENABLE_JOBS is 'false' UNLESS an explicit env EXTERNAL_SCHEDULER=true is set (documenting that jobs run elsewhere). Default ENABLE_JOBS to true.
3. In api/index.ts, add a clear top-of-file comment that this serverless entry does NOT run the scheduler or Sentry and must only be used with EXTERNAL_SCHEDULER=true + an external cron hitting /admin/jobs/run-once. If EXTERNAL_SCHEDULER is not set, make it throw.
4. Update apps/backend/vercel.json and docs/PRODUCTION_READINESS.md to state Fly is the supported prod target; remove/deprecate the deploy:vercel:api script in the root package.json.

Acceptance: `NODE_ENV=production UPLOAD_DRIVER=local` refuses to boot; `NODE_ENV=production ENABLE_JOBS=false` (without EXTERNAL_SCHEDULER) refuses to boot. Add tests in apps/backend/src/utils/__tests__/productionGuards.test.ts. Do not weaken any existing guard.
```

### P0-2 · Fix the 2FA challenge-token bypass

```
Context: In apps/backend/src/routes/auth.ts the 2FA challenge token (issued after password, before TOTP) is signed with JWT_ACCESS_SECRET and carries `sub`. apps/backend/src/auth/tokens.ts verifyAccessToken checks no purpose/aud claim, so an attacker can drop the challenge token into the cf_access cookie and pass requireAuth without the second factor.

Task:
1. Sign the 2FA challenge token with a DEDICATED secret (new env JWT_2FA_SECRET; in productionGuards require it to be strong and distinct from the access/refresh secrets) and set a claim `purpose: '2fa'` plus a short expiry (5 min).
2. Add a separate verify function for challenge tokens; verifyAccessToken must reject any token whose purpose is not the access purpose (add an explicit purpose:'access' claim to access tokens and check it).
3. Make challenge tokens single-use: store a jti and invalidate on successful 2FA verify.
4. Add a rate limiter to POST /api/auth/2fa/verify-login (currently unlimited) in apps/backend/src/app.ts.

Acceptance: a challenge token used as an access cookie is rejected by requireAuth (add a test in apps/backend/src/routes/__tests__/auth.test.ts or security.test.ts). Existing 2FA login flow still passes. No secret defaults to JWT_ACCESS_SECRET.
```

### P0-3 · Refund reversal + payout batch atomicity

```
Context: Two money-integrity bugs.
(a) Refunds (apps/backend/src/routes/admin.ts POST /payments/:id/refund) update only the payments row. The commission_ledger entry, dealers.total_revenue, customer_profiles.total_spent, and the paid invoice are never reversed — so a dealer is paid out on money returned to the customer.
(b) apps/backend/src/services/payouts.ts generateDealerPayouts sums pending commission_ledger rows OUTSIDE the transaction that flips them to 'batched'; a settlement inserting a row in that window is marked batched-but-unpaid, undetectably.

Task:
1. On refund of an invoice-linked payment, inside the existing refund transaction: insert a reversing commission_ledger entry (negative net) OR mark the original entry reversed; decrement dealers.total_revenue and customer_profiles.total_spent by the refunded portion; set the linked invoice status to 'refunded' (add the enum value if missing, in schema.ts + bootstrap.sql). Support partial refunds proportionally.
2. In generateDealerPayouts, select the pending rows FOR UPDATE (or UPDATE ... WHERE status='pending' RETURNING net_amount) and sum the RETURNED rows inside one transaction. Add a payout_id column to commission_ledger (schema.ts + bootstrap.sql migration) and set it when batching so batched rows are traceable to their payout.
3. Take the scheduler advisory lock (or row locks) in the admin-triggered payout generate path so two admins can't double-generate; make markPayoutPaid preserve the existing note (note ?? existing, not note ?? null).

Acceptance: add tests — full refund of a settled invoice reverses commission and counters and marks the invoice refunded; a commission row inserted concurrently with payout generation is never left pending-but-uncounted. Keep the existing under-lock cap re-check.
```

### P0-4 · Durable uploads + delete documents on account deletion

```
Context: The hard-delete branch of DELETE /api/customer/account (apps/backend/src/routes/customer.ts ~line 980) deletes customer_profiles/profiles rows but never calls deleteStoredFile for qidDocumentPath / driversLicensePath, leaking PII. (The anonymize branch does delete them.) Also uploads must be blob-only in prod (handled in P0-1).

Task: In both the hard-delete and anonymize branches of account deletion, delete the stored QID and driver's-license files via the storage layer (apps/backend/src/storage/index.ts). Guard against missing paths. Wrap file deletion so a storage error doesn't abort the DB deletion but is logged.

Acceptance: add a test asserting deleteStoredFile is called for both document paths in the no-rentals (hard delete) path.
```

---

## PHASE 1 — Soft-launch hardening

### P1-1 · Enforce RBAC per admin route + per-role frontend gating

```
Context: apps/backend/src/routes/admin.ts mounts requireAuth + requireAdminPortal (admits admin|finance|ops|support), but several mutating routes carry no further guard, so ops/support can edit plan pricing (PATCH /plans/:id ~1158), approve/suspend dealers (~788), mark customer KYC verified (~467), cancel rentals (~558), delete bookings (~1553), create vehicles (~187). In apps/admin, all routes accept all four portal roles (App.tsx:47, ProtectedRoute.tsx default allow) — only sidebar visibility differs.

Task:
1. Backend: decide and enforce a capability per mutating admin route. Move pricing/trust/config mutations (plan create/update/delete, dealer approve/suspend, customer verification, vehicle create/delete) to requireFullAdmin; keep genuine ops actions on a deliberate capability. Fix audit logs that hardcode actorRole:'admin' to use req.user!.role (admin.ts:483,814,1073).
2. Frontend (apps/admin): pass an explicit `allow` array per <Route> mirroring the roles in AdminLayout NAV_ITEMS; add a shared 403 "You don't have access" screen shown when a role hits a disallowed route.
3. Extend apps/backend/src/routes/__tests__/admin-rbac.test.ts to assert ops/support get 403 on every route you just locked down.

Acceptance: ops and support receive 403 on plan edit, dealer status, customer verification, rental cancel, booking delete, vehicle create; full admin and (where appropriate) finance still succeed.
```

### P1-2 · Wire real observability + alerting

```
Context: apps/backend/src/utils/observability.ts calls Sentry.init only when SENTRY_DSN is set but never installs an express error handler and never calls captureException, so handled 500s never become issues. Logs are ~60 bare console.* calls; the error middleware (app.ts) logs without the request id.

Task:
1. Install Sentry's express error handler (Sentry.setupExpressErrorHandler(app)) after routes, and call Sentry.captureException in the global error middleware and in the scheduler job catch blocks (services/scheduler.ts).
2. Introduce a structured logger (reuse utils/requestContext.ts logStructured) and replace console.error/log in the error middleware, scheduler, payments/webhook, and settlement paths with it, always including the request id / job name.
3. Add lightweight alerting hooks: after each scheduler sweep, if stuckPendingCount > 0 or lastJobsSweepAt is older than 2× JOBS_INTERVAL_MS, capture a Sentry message. Expose these in /health.
4. Isolate each scheduler job's failure so one job's throw doesn't abort the rest of the sweep.

Acceptance: a thrown error in any route is captured by Sentry (mock and assert in a test); scheduler continues past a failing job; /health reports lastJobsSweepAt and stuckPendingCount.
```

### P1-3 · Same-site cookie domains for cross-origin auth

```
Context: apps/backend/src/auth/tokens.ts sets cookies SameSite=None; Secure with no Domain. Across *.vercel.app these are third-party cookies blocked by Safari/Chrome. Target topology is one registrable domain: api.carflow.qa + app subdomains.

Task: Add a COOKIE_DOMAIN env var. When set, cookies are issued with Domain=<value> and SameSite=Lax (secure) instead of SameSite=None. Keep SameSite=None only as a fallback when COOKIE_DOMAIN is unset. Update productionGuards to warn if COOKIE_SECURE=true but COOKIE_DOMAIN is unset. Update .env.example and docs.

Acceptance: with COOKIE_DOMAIN=.carflow.qa, login sets Domain=.carflow.qa; SameSite=Lax cookies. Add a unit test for the cookie-attribute builder.
```

### P1-4 · Fix promo economics + add admin promo management

```
Context: apps/backend/src/services/promoCodes.ts + routes/payments.ts + services/booking.ts. A first-month promo becomes a LIFETIME discount because booking.ts sets monthly_amount = paidAmount (~237) and total_amount = monthly × term (~249). Also: no per-customer redemption limit and no UNIQUE(promo_code_id, customer_id); maxUses checked at intent but incremented at webhook (race); redemption fires outside the settlement transaction.

Task:
1. Separate list price from discount: store the vehicle's list monthly price on the rental (or booking note as a typed field) and apply the promo ONLY to the first invoice. Renewals must bill the list monthly price.
2. Add UNIQUE(promo_code_id, customer_id) to promo_redemptions (schema.ts + bootstrap.sql) and check it before applying.
3. Move redeemPromoCode INSIDE the settlement transaction in services/paymentSettlement.ts and re-validate maxUses there (atomic increment).
4. Add admin promo CRUD: backend routes (GET/POST/PATCH/DELETE /api/admin/promo-codes, requireFullAdmin, audited) and a Promos page in apps/admin.

Acceptance: a 50%-off-first-month promo bills full price on renewal (test); the same customer cannot redeem the same code twice; concurrent redemptions cannot exceed maxUses; admin can create/list/disable promos.
```

### P1-5 · Email outbox + missing notifications

```
Context: apps/backend/src/services/mail.ts sends Resend fire-and-forget (no retry/queue); the reminder dedup row is written before the send (invoiceReminders.ts:68-98) so a failed reminder is never retried; with RESEND_API_KEY unset, prod only warns and console.logs full email HTML including reset/verify links. Several events have no email: booking decline, complaint reply, payout paid, account suspension.

Task:
1. Add an email_outbox table (schema.ts + bootstrap.sql): id, to, subject, html, status(pending|sent|failed), attempts, last_error, created_at. Route all sends through it; a scheduler job retries pending/failed with backoff and a max-attempts dead-letter state.
2. Only write the invoice_reminder_sends dedup row AFTER a successful enqueue/send.
3. In productionGuards, HARD-FAIL prod boot when RESEND_API_KEY is unset. Never console.log email HTML in production (log subject + recipient only).
4. Add emails for: booking declined (to customer), complaint reply (to customer), payout paid (to dealer), account suspended (to user's email, since they can't read the in-app notice).

Acceptance: a failed send is retried and visible in the outbox; prod refuses to boot without RESEND_API_KEY; the four new events enqueue email. Add tests.
```

### P1-6 · Rate-limit hardening + account lockout

```
Context: apps/backend/src/app.ts skips every rate limiter when NODE_ENV !== 'production', so any misconfigured staging deploy has zero throttling. Login limiting is IP-only with no per-account lockout.

Task:
1. Change the limiter skip condition to skip ONLY in tests (process.env.VITEST === 'true'), never based on NODE_ENV.
2. Add per-account failed-login tracking with exponential backoff / temporary lockout (store attempt count + locked_until on the profile or a small auth_attempts table). Reset on success.
3. Ensure /api/auth/2fa/verify-login is rate-limited (also covered in P0-2).

Acceptance: rate limits are active in non-production, non-test environments; N failed logins for one account trigger a lockout with a clear 429/423 response. Tests added.
```

### P1-7 · Server-side browse filtering + pagination

```
Context: apps/customer/src/pages/BrowseCarsPage.tsx fetches only listCatalogVehicles({ pageSize: 20 }) and does search/filter/sort CLIENT-side over those 20 rows, so the catalog is silently capped at 20 and the "N cars available" count lies. The backend /api/customer/vehicles already paginates.

Task: Pass filter/sort/search params to the backend GET /api/customer/vehicles endpoint (extend it to accept category, make, fuelType, price range, min rating, sort, search, page/pageSize). Render server-driven pagination or infinite scroll. Show the true total from the API. Remove the client-only filtering that operated on the 20-row slice.

Acceptance: filtering by category with >20 matching vehicles returns beyond the first 20; the count reflects the server total.
```

---

## PHASE 2 — Scale & correctness

### P2-1 · Adopt zod validation at router boundaries

```
Context: The backend uses no zod; validation is manual and several routes accept unvalidated input: admin.ts POST /vehicles takes raw `status` and unchecked `dealerId` (can mint a 'rented' ghost vehicle) ~187; PATCH /plans/:id takes arbitrary tier/status/price ~1158; POST /admin/messages ~1437 unvalidated; customerFeatures.ts review rating NaN bypass ~55; /auth/logout-all lacks try/catch and asyncHandler ~191.

Task: Add zod schemas for request bodies on the listed routes (and any sibling mutating routes in the same files). Parse at the top of each handler; return 400 with the zod error summary on failure. Route admin vehicle creation through the same guarded status machine the dealer path uses (no raw status; validate dealerId exists). Wrap logout-all in asyncHandler.

Acceptance: POST /admin/vehicles cannot create a 'rented' vehicle or an orphan dealerId; PATCH /plans rejects unknown tier/status; NaN review rating returns 400; tests added.
```

### P2-2 · Codify DB invariants in schema.ts + make audit_logs immutable

```
Context: The idempotency-critical partial-unique indexes and money CHECK constraints exist only in bootstrap.sql/drizzle SQL, not in apps/backend/src/db/schema.ts. If an env is provisioned from schema.ts, onConflictDoNothing in billing silently stops being idempotent (duplicate invoices, no error). audit_logs is insert-only by convention only (no REVOKE/trigger); polymorphic invoices.owner_id/subscriptions.owner_id have no FK.

Task:
1. Add a startup assertion (run at boot, non-test) that verifies the critical unique indexes exist: invoices(rental_id, period_start) partial, one-open-rental-per-vehicle partial, one-pending-payment-per-booking/invoice partial, unique external_transaction_id. Throw with a clear message if missing.
2. Add a migration that REVOKEs UPDATE/DELETE on audit_logs from the application role.
3. Add payments.refund_of_payment_id .references() in schema.ts to match the SQL FK.

Acceptance: booting against a DB missing an invariant index throws a descriptive error; a migration test confirms the REVOKE. Do not change the runtime source of truth (bootstrap.sql) semantics.
```

### P2-3 · Enable CSP + harden upload content handling

```
Context: apps/backend/src/app.ts runs helmet with contentSecurityPolicy:false; uploads.ts derives file extension from the client filename (~120,125) and trusts client MIME, so a user can store evil.html served as text/html on the API origin (no CSP to stop it). Identity docs are correctly not statically served.

Task:
1. Derive the stored file extension from a validated MIME whitelist (map image/png->.png etc.), not from originalname. Verify magic bytes for images. Reject anything not on the whitelist.
2. Serve static upload routes with Content-Disposition: attachment and a restrictive Content-Type.
3. Enable a Content-Security-Policy via helmet (start report-only, then enforce): default-src 'self'; adjust for the API's needs. Keep it as an env-tunable string.

Acceptance: uploading evil.html with a spoofed image MIME is rejected or stored with an image extension and served as attachment; CSP header present. Tests in uploads.test.ts.
```

### P2-4 · Fix timezone drift, transactional extension, reminder windows

```
Context: Billing uses Asia/Qatar (utils/dates.ts todayISO) but booking.ts:41 and analyticsRollups.ts:7-8 use UTC — a subscription created 00:00–03:00 Qatar time is dated "yesterday". rentalExtension.ts:42-68 does an unlocked read-modify-write of total_amount across three autocommits. invoiceReminders.ts:57-64 matches an EXACT date so a scheduler outage skips a stage forever.

Task:
1. Replace new Date().toISOString()-derived "today" in booking.ts and analyticsRollups.ts with the Qatar-aware todayISO() helper.
2. Wrap extendRentalTerm in a db.transaction with SELECT ... FOR UPDATE on the rental; make the rentals update + extensions insert + event insert atomic.
3. Change reminder-ladder stage matching from exact-date equality to due-window >= comparisons, relying on the invoice_reminder_sends unique row as the idempotency guard (write it after send per P1-5).

Acceptance: checkout at 01:00 Qatar time anchors to today's Qatar date; concurrent double-extend cannot double-charge; a reminder missed for a day is still sent when the scheduler next runs. Tests added.
```

### P2-5 · Consolidate duplicated logic into packages/shared

```
Context: ErrorBoundary, ProtectedRoute, the apiClient wrapper + refresh logic, mock client, service-mode, and auth-redirect are copy-pasted across apps/customer|dealer|admin (three divergent variants). Status labels, currency, and date formatting are inconsistent (shared formatCurrency/formatDate exist but many files hand-roll `QAR ${x.toLocaleString()}` and raw toLocaleDateString).

Task: Move the shared plumbing into packages/shared: a single apiClient wrapper (with the single-flight refresh + 401 event), a shared ProtectedRoute (parameterized by allowed roles), a shared ErrorBoundary, and RENTAL/BOOKING/INVOICE status-label maps + formatCurrency/formatDate. Update all three apps to import from shared and delete the per-app copies. Add an ESLint rule (or a convention test) forbidding raw `QAR ${` and raw toLocaleDateString in app code.

Acceptance: the three apps build and pass tests using the shared modules; no duplicated ProtectedRoute/apiClient remains; currency/date rendering is consistent. Do this incrementally per-app so each app stays green.
```

### P2-6 · Qatar-specific validation (client + server)

```
Context: There is no +974 phone, 11-digit QID, or driver's-license format validation anywhere; checkout only checks non-empty. zod is a declared dependency, unused.

Task: Add shared zod validators in packages/shared (qatarPhone: +974 followed by 8 digits; qid: 11 digits; license: agreed format). Enforce them on the customer checkout form (apps/customer CheckoutPage) and on the corresponding backend routes (profile/documents, booking creation). Show inline field errors.

Acceptance: invalid QID/phone are rejected client- and server-side with clear messages; valid Qatar formats pass. Tests added.
```

### P2-7 · Move in-memory aggregation to SQL

```
Context: dealer.ts /analytics loads ALL rentals + ALL payments into memory (~137-139); admin.ts /customer-stats loads all customers (~116); customer.ts /dashboard loads all rentals then slices (~142). These blow up at thousands of rentals. services/dashboardStats.ts already shows the SQL-aggregate pattern.

Task: Rewrite these three endpoints to compute their KPIs with SQL aggregate queries (COUNT/SUM/GROUP BY, date filters in SQL) instead of loading rows into Node. Preserve the exact response shapes.

Acceptance: responses are byte-compatible with today for a seeded dataset (add a test), but issue bounded aggregate queries rather than full-table selects.
```

### P2-8 · Fill the E2E gaps

```
Context: e2e/ has 22 specs but many are 9-line "page loads" stubs; the a11y suite asserts only "body is visible" (no axe); there is no real payment→booking E2E and no cross-origin cookie test; the admin suspend spec can strand the seeded customer suspended.

Task:
1. Add axe-core assertions (via @axe-core/playwright) to e2e/a11y specs on the key customer/dealer/admin pages.
2. Flesh out the 9-line stubs (billing, favorites, dealer inventory/leads/analytics) into real assertions.
3. Add a sandbox-SkipCash checkout→webhook→booking-visible E2E runnable against a staging host (guard with an env flag so it skips locally where SkipCash can't reach localhost).
4. Move the admin suspend/re-activate into a try/finally (or afterEach) so a mid-test failure always re-activates the seeded customer.

Acceptance: a11y specs fail on real violations; the suspend spec never leaves customer@carflow.dev suspended; stubs assert real content.
```

### P2-9 · Delete dead code and fix stale docs

```
Context: Root src/ (Figma-to-code prototype), the entire supabase/ tree (pre-Express legacy: migrations, RLS, edge functions), and apps/backend/src/routes/figma.ts + services/figmaMCP.ts (throw "not implemented", dev-only) are inert. Legacy unrouted customer pages (Dashboard/MyRentals/MyRequests/MyFavorites/ShoppingCartPage/BookingConfirmedPage) are dead. docs/BUSINESS_USE_CASE_AUDIT.md and docs/FLOW_AND_VERIFICATION.md still describe a Supabase architecture that no longer exists.

Task: Remove the dead code (root src/, supabase/, figma route+service, unrouted legacy pages) after confirming nothing imports them (grep first). Rewrite or clearly mark the two Supabase-era docs to reflect the current Express/Neon/Drizzle architecture. Remove unused heavy deps (react-hook-form, @tanstack/react-table, date-fns, unused @radix-ui) from the apps that don't use them, and move test-only libs (jsdom, @testing-library, msw) to devDependencies.

Acceptance: the three apps and backend build and pass tests after removal; grep confirms no live import of the deleted modules; docs no longer reference Supabase as the backend.
```

---

## PHASE 3 — Product intelligence & polish

### P3-1 · Analytics event taxonomy + wire the rollups UI

```
Context: services/analyticsRollups.ts + admin rollup endpoints exist but AdminAnalyticsPage never calls them; there is no event taxonomy to measure activation, approval SLA, payment success rate, or churn.

Task: Define a typed event taxonomy (signup, email_verified, booking_created, booking_approved, rental_activated, invoice_generated, invoice_paid, invoice_overdue, swap_requested, cancel_requested, refund_issued, payout_paid, complaint_opened) and emit these events from the relevant backend services into an analytics_events table (or extend audit). Wire AdminAnalyticsPage to the rollups endpoints and add activation / approval-SLA / payment-success-rate / churn tiles.

Acceptance: events are recorded at the right lifecycle points; the admin analytics page shows the new metrics from real data.
```

### P3-2 · Runtime config + feature flags + first-admin bootstrap

```
Context: Every business knob (PLATFORM_COMMISSION_RATE, BILLING_GRACE_DAYS, PAYMENT_HOLD_TTL_MINUTES, CANCEL_NOTICE_DAYS, SWAP_ELIGIBLE_DAYS) is an env var requiring redeploy; there are no kill switches; there is no first-admin bootstrap except manual SQL; mark-paid and anonymize are one-way with no reversal.

Task: Move these knobs into the app_settings table with an admin settings screen (requireFullAdmin, audited), read at use-time with env fallback. Add feature flags to pause signups / online payments / new bookings. Add a one-time first-admin bootstrap CLI command (apps/backend/scripts) guarded to refuse if any admin already exists. Add reversal paths: un-mark a payout as paid (audited) and void an invoice (audited).

Acceptance: changing commission rate in the admin UI affects new commission calculations without a redeploy; a kill switch blocks new online payments; the bootstrap command creates exactly one admin and refuses on re-run.
```

### P3-3 · UX polish

```
Context: The email-verification landing page (apps/customer VerifyEmailPage) is inline-styled with no Header/Footer — the first page every new user hits. There is no global overdue-invoice banner. Rental status wording differs across portals ("Scheduled"/"Reserved"/"Approved").

Task: Brand the verify-email page with the standard layout. Add a persistent overdue-invoice banner/nav badge in the customer app when an invoice is overdue. Use the shared RENTAL_STATUS_LABELS map (from P2-5) consistently across all three portals.

Acceptance: verify page uses the app shell; an overdue invoice is visible from anywhere in the customer app; the same rental state reads identically in customer, dealer, and admin.
```

---

### Suggested run order
P0-1 → P0-2 → P0-3 → P0-4 → (do the manual P0 steps) → P1-1 → P1-2 → P1-3 → P1-4 → P1-5 → P1-6 → P1-7 → then Phase 2 in listed order → Phase 3.

Run `npm run test:api && npm run test && npm run lint:strict` after each prompt. Commit after each green step so you can bisect if Composer introduces a regression.
