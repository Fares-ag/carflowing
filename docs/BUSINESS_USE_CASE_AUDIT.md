# CarFlow Business Use Case & Scenario Audit

A full real-world scenario analysis of every user flow across the Customer, Dealer, and Admin apps.
Each scenario describes the **expected real-world behavior**, what **exists today**, and what is **missing or broken**.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| OK | Feature exists and works end-to-end with Supabase |
| PARTIAL | UI exists but logic is incomplete, stubbed, or only local |
| MISSING | Feature does not exist at all |
| BUG | Existing feature has a logic or display error |

---

## PART 1 — CUSTOMER APP

### Scenario 1: New Customer Signs Up

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Visit homepage | See cars, marketing, CTA | OK | `HomePage` loads catalog via React Query |
| Click "Sign Up" | Registration form | OK | `SignUpPage` with name/email/password/confirm |
| Submit form | Account created, profile auto-created, redirected | OK | `signUp()` → Supabase auth; DB trigger auto-creates `profiles` row with role `customer` |
| Email confirmation | Verify email before login | MISSING | Supabase email confirmation is not enforced; `detectSessionInUrl: true` is set but no verification flow in UI |

### Scenario 2: Customer Logs In

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Visit `/login` | Clean login form | BUG | Form **pre-fills** `customer@carflow.com` / `password` — must be empty for production |
| Submit credentials | Authenticated, go to dashboard | OK | `login()` → Supabase `signInWithPassword` + role check |
| Try to access `/checkout` while logged out | Redirect to login, return after auth | OK | `ProtectedRoute` passes `?redirect=`; `LoginPage` respects it |
| Session persistence across refresh | Stay logged in | OK | Supabase `persistSession: true` |

### Scenario 3: Customer Browses and Filters Cars

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Visit `/browse` | See all available vehicles | OK | `listCatalogVehicles()` with public RLS on `vehicles` |
| Search by keyword | Filter results | OK | Client-side search on name/make |
| Filter by brand, category, fuel, etc. | Narrow results | OK | Client-side filters |
| Filter by minimum rating | Show only rated vehicles | BUG | Rating slider exists but **filter always returns true** — has no effect |
| Sort by price | Reorder results | OK | Client-side sort |
| See real vehicle features | Per-vehicle features from DB | PARTIAL | Features are **synthetically generated** from a static array using index math — not from database |

### Scenario 4: Customer Adds Car to Cart and Configures

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Click "Configure" on a car | Add to cart, go to `/cart` | OK | Zustand store `setVehicle` + navigate |
| See monthly price | Based on daily rate | OK | `pricePerDay * 30` (or fallback 749) |
| Choose rental duration | 1/3/6 months with discounts | PARTIAL | Discount badge always says **"5% OFF"** even for 10% option |
| Set start date | Pick real date | BUG | Defaults to hardcoded `'2025-10-19'` — should default to today or be empty |
| Apply promo code | Validated discount | PARTIAL | Promo codes are **client-side only** (`NEWUSER20`, `WEEKEND15`, `LOYALTY10`) — no server validation |
| See tax calculation | Correct tax | OK | 5% tax calculated on discounted subtotal |
| Proceed to checkout | Go to `/checkout` | OK | `setCart()` → navigate; requires auth (protected route) |

### Scenario 5: Customer Completes Checkout

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Step 1: Billing info | Contact + address form | OK | Validation on all required fields |
| Step 2: Upload documents | QID + driver's license | OK | `uploadCustomerDocument()` → Supabase storage `documents` bucket; `updateCustomerDocuments()` upserts `customer_profiles` |
| Step 3: Choose delivery | Location + date + time | OK | Validated |
| Step 3: Enter payment | Card / PayPal / Google Pay | PARTIAL | **No real payment processing**. Card numbers stored in local state only, never sent to a payment provider. UI is cosmetic. |
| Confirm booking | Charge customer, create booking | PARTIAL | `createBookingRequest()` creates DB row (status `pending`), but **no charge occurs**. "Booking Confirmed" is misleading — it's actually a request. |
| See confirmation page | Summary + invoice | OK (UI) | Shows summary, invoice with `window.print()` download. But "Paid" status is **false** since no real payment. |
| Receive email confirmation | Email with booking details | MISSING | `send-email` edge function is a **stub** |

### Scenario 6: Customer Views Their Bookings / Requests

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Go to `/requests` | See all booking requests | OK | `listBookingRequestsWithVehicles()` with vehicle + dealer join |
| See request status | Pending / Approved / Declined | OK | From `booking_requests.status` |
| Filter/search requests | Narrow list | OK | Client-side |
| Create new request from dashboard | Quick booking | BUG | "New Request" uses **hardcoded `vehicleId: 'veh_1'`** — will fail if that ID doesn't exist |
| Edit a request | Change notes/status | PARTIAL | Edit modal lets user change **status** (even to approved/declined) but **note text is not saved** — only status via `updateBookingRequestStatus` |
| Cancel a request | Set to declined | OK | `updateBookingRequestStatus(id, 'declined')` |

### Scenario 7: Customer Manages Rentals

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Go to `/rentals` | See active + past rentals | OK | `listRentalsWithDetails()` with vehicle + dealer joins |
| See rental details | Vehicle, dealer, dates, amount | PARTIAL | Location always shows **'—'**; no pickup/return location in schema |
| Call dealer | Phone link | OK | `tel:` link from dealer `contact_phone` |
| Pay remaining balance | Make payment | PARTIAL | "Pay Balance" calls `updateRentalStatus(id, 'active')` — **does not process payment**, just changes status |
| Extend rental | Request extension | PARTIAL | Opens modal with **fake message** "Extension request submitted" — no API call |
| Download contract | Get PDF | PARTIAL | Downloads a **plain text** summary, not a real contract |
| Rate a past rental | Leave review | MISSING | Button shows **"Coming soon"** toast |
| Rent again | Re-book same car | PARTIAL | Button exists but navigates with **stale data** |

### Scenario 8: Customer Manages Favorites

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Favorite a car from browse | Save to favorites | OK | `addFavorite()` — but **no auth gate in UI** (will fail silently if not logged in, depends on Supabase throwing) |
| View favorites | See saved cars | PARTIAL | Hydrates from catalog, but catalog `pageSize: 12` may miss vehicles → **"Unknown vehicle"** entries |
| Remove / clear favorites | Remove one or all | OK | `removeFavorite()` / `clearFavorites()` |

### Scenario 9: Customer Manages Account Settings

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Go to `/settings` | See profile, security, etc. | OK (route) | `AccountSettings` with 6 sections |
| Edit profile | Change name, email, phone | PARTIAL | Form is **pre-filled with hardcoded defaults** ("Ahmed", "lkjjh@gmail.com"). "Save Changes" **toggles edit mode but does not call any API** for name/email/phone |
| Upload avatar | Change profile photo | OK | `uploadAvatar()` + `updateProfileAvatar()` |
| Change password | Update via auth | MISSING | Button exists but **no handler** — no Supabase `updateUser({ password })` call |
| Enable 2FA | Security feature | MISSING | Toggle exists in UI but **no API** |
| Set notification preferences | Email/push prefs | PARTIAL | Saved to **localStorage only** — not synced to server |
| Manage preferences | Language, timezone, theme | PARTIAL | Dropdowns exist but **Save button has no handler** |
| Verify identity | Upload verification docs | PARTIAL | Shows "Verified" badges but upload buttons have **no file input and no API** |
| Export data | GDPR export | PARTIAL | Button exists but **no handler** |
| Delete account | Remove account | PARTIAL | Confirmation modal works, but confirm button has **no `onClick`** |

### Scenario 10: Customer Subscription & Billing

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| View subscription | See current plan | PARTIAL | UI shows **SaaS-generic** content (users/projects/storage/API) — not car-rental relevant. `getSubscription()` exists but is **never called**. |
| View invoices | Payment history | OK (data) | `listInvoices()` returns real data |
| Manage payment methods | Add/remove cards | PARTIAL | Add card appends **local state only** (`pm_*` ID); remove is local. **No API** |
| Download invoice | Get PDF/CSV | PARTIAL | CSV download of invoice table; no real PDF |

### Scenario 11: Customer Uses Navigation

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Click "Contact" in header | Contact page | OK | `/contact` route exists |
| Click "FAQ's" in header | FAQ page | OK | `/faqs` route exists |
| Click "How It Works" in header | Info page | MISSING | Link to `/how-it-works` exists in Header and BrowseCarsPage — **no route** |
| Click "Payment" in sidebar | Payment page | MISSING | Sidebar links to `/payment` — **no route** |
| Notifications bell | See notifications | OK | Header fetches from `notifications` table; mark read works |

---

## PART 2 — DEALER APP

### Scenario 12: Dealer Logs In

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Visit `/login` | Login form | BUG | Pre-fills `dealer@carflow.com` / `password` |
| Submit | Auth + role check | OK | `signInWithPassword` + dealer role verification |
| Redirect after login from protected page | Return to intended page | MISSING | No `?redirect=` support (always goes to `/dashboard`) |

### Scenario 13: Dealer Views Dashboard

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| See KPIs | Revenue, rentals, vehicles, leads | OK (data) | `getDealerDashboard()` aggregates from Supabase |
| Revenue chart | Monthly revenue trend | PARTIAL | Chart Y-axis **hardcoded** `domain={[0, 60000]}` and ticks — does not scale to real data |
| Recent bookings | Latest activity | OK | From rentals with joins |
| Vehicle status | Fleet overview | OK | From vehicles table |
| Loading/error states | Feedback during fetch | MISSING | No loading spinner or error handling on dashboard |

### Scenario 14: Dealer Manages Inventory

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| View all vehicles | Paginated list/grid | OK | `listInventory()` scoped by dealer |
| Search/filter/sort | Narrow results | OK | Client-side |
| Add new vehicle | Full form + image upload | PARTIAL | `AddVehicleModal`: image upload works (`uploadVehicleImage`), but **features checklist (26 items), weekly/monthly rates, license plate, color, description are NOT sent to API**. Only: name, category, year, daily rate, status, image, mileage, fuel, transmission, seats. |
| Edit vehicle | Update details | PARTIAL | `EditVehicleModal`: many fields shown (fuel, transmission, seats, color, plate, description) but `updateVehicle()` only saves: name, category, year, price, status, image. **Other fields are discarded.** |
| View vehicle details | Specifications, maintenance, analytics | PARTIAL | `VehicleDetailsModal` shows tabs but **Maintenance is static hardcoded rows**, **Analytics is static 85% utilization**, **Specifications are mostly hardcoded** (not from vehicle record). Export/Duplicate buttons have **no onClick**. |
| Delete vehicle | Remove from fleet | OK | `removeVehicle()` |
| Export inventory | CSV download | OK | Client-side CSV |
| Stats strip | Total, available, rented, maintenance | PARTIAL | Meta text "+2 this month", "67% utilization" etc. are **hardcoded strings**, not calculated |

### Scenario 15: Dealer Manages Booking Requests

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| View requests | List with vehicle info | PARTIAL | `listBookingRequests()` has **no explicit dealer_id filter in code** — relies on RLS. If RLS for dealer select on `booking_requests` works correctly, this is OK. |
| Approve request | Accept booking | OK | `updateBookingRequestStatus(id, 'approved')` — triggers DB function `handle_booking_approved` which creates a rental + payment + notification |
| Decline request | Reject booking | OK | `updateBookingRequestStatus(id, 'declined')` |
| See customer details | Who is requesting | MISSING | Table only shows vehicle name and booking ID — no customer name/email/phone |

### Scenario 16: Dealer Manages Leads

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| View leads | List with status | OK | `listLeads()` scoped by dealer |
| Add lead | Create new | PARTIAL | `createLead()` only sends name, email, phone, source, stage. **Vehicle interest, priority, and notes shown in modal are NOT sent.** |
| Update lead | Change stage | PARTIAL | `updateLead()` only sends **stage**. Phone, email, notes, priority, score shown in Manage modal are **not saved**. |
| Delete lead | Remove | OK | `removeLead()` |
| Call/email lead | Direct contact | OK | `tel:` and `mailto:` links |
| Stats cards | Lead counts/rates | BUG | Top stat cards show **hardcoded** "3 new", "1 contacted", "68% conversion", "2.4h response" — not from data |

### Scenario 17: Dealer Views Analytics

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Overview tab | Revenue, bookings, fleet | OK (data) | `getDealerAnalytics()` aggregates |
| Revenue tab | Charts + trends | PARTIAL | Revenue chart works; but `customerDemographics` and `bookingTime` return **empty arrays** from service |
| Customers tab | Demographics, geography | PARTIAL | Geographic distribution always shows **"No location data"** |
| Vehicles tab | Fleet analytics | PARTIAL | Maintenance schedule always shows **"No maintenance data"** |
| Insights tab | AI recommendations | PARTIAL | **Fully hardcoded** "AI-Powered Insights" with one canned card |
| Date filter | Change time range | MISSING | Date `<select>` exists but **does not trigger re-fetch** |
| Export | Download data | OK | CSV from revenue trend |

### Scenario 18: Dealer Manages Subscription & Billing

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| View current plan | Plan details | PARTIAL | Plan name, price, features are **hardcoded in UI** ("Professional", "QAR 299/month"). `getSubscription()` data is only used for usage bars. |
| Usage tracking | See usage vs limits | BUG | Usage mapping is **wrong**: `listings` → "Vehicles" (should be vehicle count), `rentals` → "Leads" (wrong entity), `messages` → "API Calls" (wrong entity) |
| Switch plan | Upgrade/downgrade | MISSING | "Choose Plan" opens modal but **no checkout or API to change plan** |
| Cancel subscription | End plan | PARTIAL | Confirm dialog exists, locally sets `selectedPlanName` to null — **no API call** |
| Add/remove payment method | Manage cards | PARTIAL | Remove is **client-only state**; add form has **no handler** |
| View billing history | Past invoices | OK | `listBillingHistory()` from `invoices` |
| Download invoices | CSV export | OK | Client-side CSV |

### Scenario 19: Dealer Manages Settings

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Edit business info | Name, email, phone, etc. | OK | `getDealerSettings()` + `updateDealerSettings()` |
| Set business hours | Daily schedule | OK | Toggle + time inputs → saved with settings |
| Upload logo | Brand image | PARTIAL | Uploads to `user-avatars` bucket, but **user must click Save to persist** the URL to the `dealers` table. UX doesn't make this clear. |
| Notifications settings | Configure alerts | MISSING | Tab shows notifications list but **no write APIs for preferences** |
| Security settings | Password, sessions | MISSING | Tab shows **text blurbs only**, no actions |
| Privacy settings | Data management | MISSING | Tab shows **text blurbs only**, no actions |
| API settings | Integration | BUG | Displays raw `VITE_SUPABASE_URL` — **exposes backend URL** |

### Scenario 20: Dealer Views Notifications

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| View list | All notifications | PARTIAL | `listNotifications()` has **no user_id filter in code** — relies on RLS |
| Mark as read | Click notification | OK | `markNotificationRead()` |
| Mark all read | Bulk action | PARTIAL | `markAllNotificationsRead()` has **no user filter in code** — relies on RLS |
| Real timestamps | When it happened | BUG | Time shows **`${index + 1} hour ago`** — not from `created_at` |
| Notification types | Categorized icons | BUG | Type alternates booking/payment **by index**, not from data |

---

## PART 3 — ADMIN APP

### Scenario 21: Admin Logs In

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Visit `/login` | Login form | BUG | Pre-fills `admin@carflow.com` / `password` |
| Submit | Auth + admin role check | OK | Role check; non-admin signed out |

### Scenario 22: Admin Dashboard

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| KPI cards | Revenue, rentals, cars, dealers | BUG | `totalCars` and `totalBookings` both map from **same** "Total Rentals" KPI — **4th card is mislabeled** |
| Donut chart | Daily booking status | PARTIAL | Actually shows **all-time rental status** mix. Date selectors are **non-functional** |
| Recent bookings table | Latest activity | PARTIAL | Status mapping: **`completed` → "Cancelled"** — **BUG**. Location always '—'. |
| Rental trend chart | Monthly trends | OK | Line chart from dashboard data |
| Export CSV | Download data | OK | Client-side |

### Scenario 23: Admin Manages Vehicles (Cars Page)

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| View requests | Rental-based request queue | PARTIAL | Primary table is **rentals framed as "requests"** with synthetic priority. Confusing: page is named "Cars" but shows rentals. |
| Approve request | Complete rental | PARTIAL | "Approve" calls `updateRentalStatus(id, 'completed')` — labels it "approve" but actually completes |
| Vehicle inventory | Second table | OK | `listVehicles()` |
| Add vehicle | Via modal | PARTIAL | `AddCarModal` — many fields cosmetic (see Component audit). `createVehicle()` only saves core fields. |
| Delete vehicle | Remove | OK | `deleteVehicle()` with confirm |
| Stats | Counts | PARTIAL | "Avg Response 2.4h" is **hardcoded** |

### Scenario 24: Admin Manages Booking Requests

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| View all requests | Platform-wide list | OK | `listBookingRequests()` |
| Approve/Decline | Change status | OK | `updateBookingRequestStatus()` — triggers rental creation on approve |
| Delete request | Remove | OK | `deleteBookingRequest()` — **no confirmation dialog** |

### Scenario 25: Admin Manages Customers

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| View customer list | All customers + stats | OK | `listCustomersWithStats()` (joins `customer_profiles`) |
| View customer details | Profile + rental history | OK | `getCustomerDetails()` overlay |
| Edit customer | Name, phone, verification | PARTIAL | `updateCustomerProfile()` + `updateCustomerVerification()`. But **account status is not updated from edit modal** |
| Ban/unban customer | Toggle active/suspended | OK | `updateCustomerStatus()` |
| Pagination | Browse large lists | MISSING | Fixed `pageSize: 100` — **no pagination UI** |

### Scenario 26: Admin Manages Dealers

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| View dealer list | All dealers | OK | `listDealers()` |
| Toggle active/suspended | Manage status | OK | `updateDealerStatus()` |
| View dealer details | Overlay | PARTIAL | Shows **synthetic contact names**, **hardcoded locations** (Al Sadd / West Bay), **synthetic review counts** |
| Delete dealer | Remove | MISSING | No delete action in UI (`deleteDealer` exists in service but unused) |
| Create dealer | Onboard new | MISSING | No UI to create a new dealer — only admin SQL/seed creates dealers |

### Scenario 27: Admin Manages Rentals

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| View all rentals | Platform-wide list | PARTIAL | `listRentals()` but **no joins** — customer shows **`Customer ${index+1}`**, vehicle not shown. `listRentalsWithDetails` exists but is **not used** on this page. |
| Filter by status | Narrow list | OK | Client-side |
| Export CSV | Download | OK | |
| Stats | Revenue, active, completed, cancelled | PARTIAL | Delta badges (+12%, +5%, etc.) are **hardcoded**, not calculated |

### Scenario 28: Admin Manages Payments

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| View all payments | Transaction list | PARTIAL | `listPayments()` but customer shows **`Customer ${index+1}`**, vehicle is **fabricated** label, transaction IDs are **synthetic** `TXN-2025-${1234+index}` |
| Filter/search | Narrow results | OK | Including "more filters" (method, min amount) |
| Process refund | Return payment | MISSING | No refund action in UI or service |
| Stats | Revenue totals | PARTIAL | Badge percentages **hardcoded** |

### Scenario 29: Admin Manages Plans

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| View plans | All subscription plans | OK | `listPlans()` |
| Create plan | New plan modal | OK | `createPlan()` — multi-step modal with name, tier, prices, features |
| Edit plan | Update existing | BUG | "Edit" opens same modal but **submit always calls `createPlan()`** — **creates duplicate instead of updating** |
| Delete plan | Remove | OK | `deletePlan()` |
| Toggle active/archived | Plan status | OK | `updatePlan({ status })` |
| Customer/Dealer toggle | Filter by audience | PARTIAL | "Customer" just **hides plans with 'enterprise' in name** — not a real audience field |

### Scenario 30: Admin Manages Complaints

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| View complaints | List from customers | PARTIAL | `listComplaints()` but user names/emails/types are **fabricated from index** |
| Change status | Cycle open → in_progress → resolved | OK | `updateComplaintStatus()` |
| Charts | Category breakdown, trends | PARTIAL | Both charts use **fully hardcoded data arrays** — not from API |
| Respond to complaint | Send reply | MISSING | No response/reply feature |

### Scenario 31: Admin Manages Messages

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| View messages | Inbox/sent/starred/archived | PARTIAL | `listMessages()` but folder filtering, sender names/types are **fabricated from index**. Badge "3" on Inbox is **hardcoded**. |
| Read message | Mark as read | OK | `updateMessageRead()` |
| Compose message | Send to user | PARTIAL | **Local state only** — no `createMessage()` API call. Fake IDs, not persisted. |

### Scenario 32: Admin Analytics

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| KPIs | Revenue, rentals, vehicles, customers | PARTIAL | `getAdminAnalytics()` — but **avg duration and customer growth are hardcoded 0** in service |
| Charts | Revenue trend, top vehicles, categories | OK | From real aggregated data |
| Highlight cards | Key insights | BUG | Three cards fully **hardcoded** ("October", "Sedan 35%", "QAR 2,340") |

### Scenario 33: Admin Settings

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Edit app settings | Company name, support info, tax rate | OK | `getAppSettings()` / `updateAppSettings()` via `app_settings` table |

---

## PART 4 — CROSS-CUTTING / PLATFORM

### Scenario 34: Real Payment Processing

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Customer pays at checkout | Charge via Stripe/PayPal | MISSING | No payment provider integration. Card data is local state only. |
| Webhook confirms payment | Update DB payment status | MISSING | `payments-webhook` edge function is a **stub** (`{ ok: true }`) |
| Refunds | Process refund | MISSING | No refund flow anywhere |
| Invoice generation | Real PDF invoices | MISSING | Only `window.print()` and CSV available |

### Scenario 35: Email Notifications

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Booking confirmation email | Notify customer | MISSING | `send-email` edge function is a **stub** |
| Booking approved email | Notify customer | MISSING | DB trigger creates notification row but **no email** |
| Password reset email | Auth recovery | MISSING | No "Forgot password" flow in any app |

### Scenario 36: Analytics Rollup

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Scheduled aggregation | Daily/weekly rollups | MISSING | `analytics-rollup` edge function is a **stub** |

### Scenario 37: Mock API vs Real API

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Toggle mock mode | Dev without Supabase | BROKEN | `VITE_USE_MOCK_API=true` starts MSW but all services call **Supabase directly** (not `/api/*`). MSW intercepts nothing. Mock mode is effectively **non-functional** for the current service layer. |

### Scenario 38: Error Handling & Resilience

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Customer: runtime error | Graceful fallback | MISSING | **No ErrorBoundary** in customer app — white screen on uncaught error |
| Dealer: runtime error | Graceful fallback | OK | `ErrorBoundary` wraps entire app |
| Admin: runtime error | Graceful fallback | MISSING | **No ErrorBoundary** |
| Dealer: toast feedback | Success/error toasts | MISSING | **No Toaster** component in dealer `main.tsx` |
| Missing env vars | Clear error | PARTIAL | `console.warn` only — app proceeds with empty Supabase URL |

### Scenario 39: Dealer Onboarding (Creating a New Dealer)

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| New dealer signs up | Creates account + dealer profile | MISSING | No dealer signup flow. DB trigger creates profile with `customer` role. Dealer row INSERT requires **admin** (RLS). Dealers can only be created via SQL seed or admin. |

### Scenario 40: Data Scoping & Security

| Step | Expected | Status | Detail |
|------|----------|--------|--------|
| Customer sees only own data | RLS enforced | OK | RLS policies on `rentals`, `favorites`, `booking_requests`, etc. scope to `auth.uid()` |
| Dealer sees only own inventory | RLS enforced | OK | `vehicles` dealer_write/update/delete check ownership |
| Dealer notifications scoped | Only own notifications | PARTIAL | `listNotifications()` in code has **no user filter** — relies entirely on RLS (`notifications` policy requires `user_id = auth.uid()`) |
| Dealer payment methods scoped | Only own methods | PARTIAL | `listPaymentMethods()` has **no owner filter** — relies on RLS |
| Customer can't self-approve booking | Status enforcement | BUG | Customer UI allows changing request status to `approved`/`declined` via edit modal |

---

## SUMMARY: What's There vs What's Missing

### Working End-to-End (OK)
1. Customer: Browse cars → Add to cart → Checkout flow (UI) → Booking request created
2. Customer: Sign up → Login → Protected routes → Redirect-after-login
3. Customer: View rentals, requests, favorites (with Supabase data)
4. Customer: Document upload (QID + license) at checkout
5. Customer: Header notifications (real data, mark read)
6. Dealer: Login → Dashboard → Inventory CRUD → Booking approve/decline
7. Dealer: Business settings save
8. Dealer: Leads CRUD (basic)
9. Admin: Login → Dashboard → All list pages → Status management
10. Admin: Customer CRUD (view/edit/verify/ban)
11. Admin: Booking request approve/decline/delete
12. Admin: Plan CRUD (except edit bug)
13. Admin: App settings
14. DB: Trigger auto-creates profile on signup
15. DB: Trigger auto-creates rental when booking approved
16. DB: RLS enforces data scoping per role

### Partially Working (PARTIAL — needs completion)
1. Payments — UI only, no real processing
2. Account settings — most sections have no API calls
3. Subscription/billing — SaaS-generic UI, not wired
4. Vehicle features — synthetic, not from DB
5. Dealer analytics — some charts return empty data
6. Admin data display — many tables use fabricated names/IDs/locations
7. Mock API mode — MSW runs but doesn't intercept Supabase calls
8. Lead management — only stage saved, other fields discarded

### Missing Entirely
1. **Payment provider integration** (Stripe, etc.)
2. **Email system** (confirmation, notifications, password reset)
3. **Forgot password** flow
4. **Dealer sign-up / onboarding**
5. **Vehicle detail page** (e.g. `/car/:id`)
6. **`/how-it-works` page** (linked but missing)
7. **`/payment` page** (linked in sidebar but missing)
8. **Rating/review system**
9. **Rental extension** (real flow)
10. **Refund processing**
11. **Real invoice/contract PDF generation**
12. **ErrorBoundary** in customer + admin apps
13. **Toaster** in dealer app
14. **Error reporting** (Sentry or similar)
15. **E2E tests**
16. **Admin dealer creation UI**
17. **Admin message compose** (real API)
18. **Complaint response** feature

### Bugs to Fix
1. Login pages pre-fill credentials (all 3 apps)
2. Admin dashboard: `completed` rental → "Cancelled" label
3. Admin dashboard: KPI "Total Bookings" is duplicate of "Total Rentals"
4. Admin plans: edit creates duplicate instead of updating
5. Customer browse: rating filter has no effect
6. Customer cart: discount badge always says "5% OFF"
7. Customer cart: default start date hardcoded to 2025-10-19
8. Customer requests: new request uses hardcoded `veh_1`
9. Customer requests: edit modal lets customer set status to approved/declined
10. Dealer dashboard: chart Y-axis hardcoded to 60000
11. Dealer leads: stats cards are hardcoded
12. Dealer notifications: timestamps are `${index + 1} hour ago`
13. Dealer subscription: usage label mapping is wrong (rentals→leads, etc.)
14. Dealer settings API tab exposes Supabase URL
