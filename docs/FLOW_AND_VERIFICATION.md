# CarFlow Customer Flow & Verification

This document describes the main customer app flow, what was missing, what was fixed, and how to verify everything works.

## Main customer flow

1. **Home** (`/`) → Browse featured cars, categories.
2. **Browse** (`/browse`) → Filter/sort catalog, “Configure” adds a vehicle to cart and goes to cart.
3. **Cart** (`/cart`) → Set duration, quantity, dates; “Proceed to Checkout” → **requires login** (redirects to `/login?redirect=/checkout`).
4. **Checkout** (`/checkout`) — **protected (customer only)**:
   - Step 1: Billing/contact and address.
   - Step 2: Upload QID and driver’s license (uses Supabase storage + `customer_profiles`).
   - Step 3: Delivery and payment; “Confirm booking” calls `createBookingRequest` and redirects to confirmation.
5. **Booking confirmed** (`/booking-confirmed`) → Shows summary; “View Booking” → `/requests`.
6. **Account**: Dashboard, Rentals, Favorites, Requests, Billing, **Settings** — all under protected routes.

## What was missing (and fixed)

| Issue | Fix |
|-------|-----|
| **No route for `/settings`** | `AccountSettings` was linked from Dashboard/Sidebar but not in router. Added `/settings` under `ProtectedRoute`. |
| **No routes for `/contact` and `/faqs`** | Header, Footer, and BookingConfirmed linked to these but they 404’d. Added `ContactPage` and `FAQPage` with basic content. |
| **Checkout not protected** | Document upload and `createBookingRequest` require auth, but `/checkout` was public. Users could fill steps and then hit “Not authenticated”. **Checkout is now protected**; unauthenticated users are sent to `/login?redirect=/checkout` and return to checkout after login. |
| **No redirect after login** | After login, users always went to `/dashboard`. **Login now respects `?redirect=`** so e.g. `/login?redirect=/checkout` returns the user to checkout. |

## Optional / future improvements

- **Vehicle detail page** (`/car/:id` or `/vehicle/:id`) — not required for current flow (Browse → Configure → Cart) but useful for SEO and deep links.
- **E2E tests** — Playwright/Cypress for the full path: Home → Browse → Cart → Login → Checkout → Confirmation.

## Supabase setup required for full flow

1. **Env**: `.env` at monorepo root with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; `VITE_USE_MOCK_API=false` for real backend.
2. **Schema**: Run in order: `schema.sql` → `trigger.sql` → `rls.sql` → `seed.sql` (after creating auth users).
3. **Document columns**: Run `supabase/migrations/customer_profiles_documents.sql` so `customer_profiles` has `qid_document_path` and `drivers_license_path`. Run `supabase/migrations/customer_profiles_self_insert.sql` (and any related RLS) so customers can upsert their own profile for document upload.
4. **Storage**: Ensure a bucket for customer documents exists and policies allow authenticated uploads (see `uploadCustomerDocument` in shared package).

## How to verify the flow

1. **Start apps**: `npm run dev` (or `npm run dev:backend` and `npm run dev:customer`).
2. **Customer app** (http://localhost:5173):
   - **Public**: Home, Browse, Cart, Contact, FAQs, Login, Sign up.
   - **From Cart**: Click “Proceed to Checkout” → should redirect to Login with `?redirect=/checkout`; after login, should land on Checkout with cart intact.
   - **Checkout**: Complete billing → documents (upload QID + license) → delivery/payment → Confirm → Booking confirmed page; “View Booking” → Requests (protected).
   - **Account**: Dashboard → “Settings” → Account settings page; Header → Contact / FAQ’s → Contact and FAQ pages.
3. **Direct URLs**: Open `/settings`, `/contact`, `/faqs` — all should render (settings only when logged in as customer).
4. **Booking confirmed without state**: Open `/booking-confirmed` with no `location.state` (e.g. refresh) → should show “No booking details found” and link home (already implemented).
