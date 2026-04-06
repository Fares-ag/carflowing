# Production Readiness: Customer & Dealer Apps

**Short answer: The system is not yet production-ready.** The customer and dealer apps are suitable for staging/demo and development. The sections below summarize what’s in place and what must be addressed before production.

---

## What’s in good shape

### Customer app
- Supabase auth (login, signup, session, role check for `customer`).
- Protected routes (dashboard, checkout, settings, rentals, favorites, requests, billing) with redirect-after-login for checkout.
- Checkout flow: billing → documents (QID, driver’s license) → delivery/payment → create `booking_request`; card data is **not** sent to the server (only last 4 for display).
- Contact, FAQ, and Settings routes and pages.
- React Query for server state; cart in Zustand with persistence.
- Basic validation and error toasts (Sonner).

### Dealer app
- Supabase auth and role check for `dealer`.
- Protected routes; lazy-loaded pages; **ErrorBoundary** for runtime errors.
- Dealer-scoped data via `getDealerId()` (dashboard, analytics, inventory, leads, booking requests, subscription, settings).
- Uses same Supabase RLS/backend as customer.

### Shared / backend
- RLS on `profiles`, `customer_profiles`, `dealers`, `vehicles`, `booking_requests`, etc., with role-based access.
- Supabase client uses env vars; no hardcoded secrets in app code.
- Schema, triggers, and migrations for profiles, documents, and bookings.

---

## Gaps that block production

### 1. Security and auth (high)

| Issue | Where | Action |
|-------|--------|--------|
| **Pre-filled login credentials** | Customer, Dealer, Admin login pages use default email (e.g. `customer@carflow.com`, `dealer@carflow.com`) and `password` in initial state. | Remove default values; use empty strings (or only placeholder in `placeholder`). |
| **Dealer login has no redirect-after-login** | Dealer `ProtectedRoute` redirects to `/login` but does not pass `?redirect=`. After login, user always goes to `/dashboard`. | Add same pattern as customer: redirect to `/login?redirect=<path>` and use it after login (optional but improves UX). |
| **Supabase URL shown in dealer Settings** | “API base: VITE_SUPABASE_URL” is displayed. | Remove or restrict to debug mode / admin-only. |
| **No global ErrorBoundary in customer app** | Uncaught render errors can white-screen the app. | Wrap app (e.g. in `main.tsx`) with an ErrorBoundary like the dealer app. |

### 2. Payments (critical for real “booking confirmed”)

| Issue | Where | Action |
|-------|--------|--------|
| **No real payment processing** | Checkout creates a `booking_request` and shows “Booking confirmed” but does not charge the user. | Integrate a payment provider (e.g. Stripe): create PaymentIntent/Checkout Session on your backend, confirm on success, then create booking; never store raw card numbers. |
| **Payments webhook is a stub** | `supabase/functions/payments-webhook` only logs and returns `{ ok: true }`. | Implement signature verification and updates to `payments` / `rentals` (and any invoice status) when the provider sends events. |

### 3. Configuration and environment

| Issue | Where | Action |
|-------|--------|--------|
| **Mock API flag** | `VITE_USE_MOCK_API=true` starts MSW in customer and dealer. | For production builds, ensure this is `false` (or unset) and that build does not bundle mock handlers. |
| **Missing env in build** | If `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` are missing, Supabase client still gets empty string. | Fail fast in production: e.g. throw or show a clear “Misconfigured” screen if env is missing when not in dev. |
| **No CSP or security headers** | No Content-Security-Policy, X-Frame-Options, etc. | Configure on the host (e.g. Vercel/Netlify) or reverse proxy; consider strict CSP for production. |

### 4. Resilience and operations

| Issue | Where | Action |
|-------|--------|--------|
| **No error reporting** | Errors are only logged to console. | Add a service (e.g. Sentry) in both customer and dealer apps for unhandled errors and optional API failure reporting. |
| **No health/readiness checks** | No endpoint or UI to verify app + Supabase connectivity. | Optional: simple “ping” or health route that checks Supabase (e.g. auth or a cheap query) for status pages. |
| **Dealer app has no Toaster** | No global toast for success/error. | Add Sonner (or similar) in dealer `main.tsx` and use it for mutations so users get feedback. |

### 5. Data and compliance (if applicable)

| Issue | Where | Action |
|-------|--------|--------|
| **Document storage** | Customer uploads QID and driver’s license to Supabase Storage. | Ensure bucket policy and RLS are strict (only owner + allowed roles); define retention and deletion for GDPR/local rules. |
| **No rate limiting in frontend** | Auth and API calls can be retried without backoff. | Rate limiting should be on Supabase (Auth) and/or your backend; document limits and consider exponential backoff in the client for critical flows. |

---

## Recommended order of work

1. **Remove pre-filled passwords and default emails** from all login pages (customer, dealer, admin).
2. **Add ErrorBoundary** to the customer app and optional error reporting (e.g. Sentry).
3. **Integrate real payments** (Stripe or other) and implement the payments webhook so “Booking confirmed” reflects an actual charge (or reserved amount).
4. **Harden env and build**: no mock in production, fail fast if Supabase env is missing in prod.
5. **Dealer UX**: redirect-after-login (optional), Toaster, hide or restrict Supabase URL in Settings.
6. **Operations**: security headers (CSP, etc.), health check, and error reporting.

---

## Verdict

- **Customer app**: Core flows (browse, cart, protected checkout, documents, booking request, account pages) work with Supabase and are structurally sound. Not production-ready due to pre-filled credentials, no real payments, no ErrorBoundary, and env/mock handling.
- **Dealer app**: Feature-complete for dashboard, inventory, leads, requests, and settings with Supabase and RLS; has ErrorBoundary and lazy loading. Not production-ready due to pre-filled credentials, no Toaster, optional redirect-after-login, and same env/payment/operations gaps as above.

After addressing the items above (especially auth defaults, real payments, and error handling), both apps can be brought to production level with appropriate deployment and monitoring.
