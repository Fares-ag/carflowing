# CarFlow — Cursor Composer 2.5 Feature Prompts (Waves 1, 2, 4)

Capability build-out from the persona-walkthrough gap analysis. **Wave 3 (Gulf money model & compliance) is intentionally excluded** per request. These are additive feature prompts — they must not weaken the money/settlement paths hardened in the audit. **Run one at a time**, review the diff, run `npm run test:api && npm run test && npm run lint:strict`, commit, then continue.

> Repo: Express API in `apps/backend`, three Vite/React apps in `apps/customer|dealer|admin`, shared code in `packages/shared`. Auth is JWT httpOnly cookies. DB is Drizzle/Postgres; the runtime schema source of truth is `apps/backend/src/db/bootstrap.sql` (mirror any column/table you add there **and** in `apps/backend/src/db/schema.ts`, plus a drizzle migration). Add `zod` validation on every new route body. Audit every new mutation via `services/audit.ts`. Line numbers are approximate — anchor on the named function/file.

---

# WAVE 1 — Surfacing gaps (backend mostly exists; wire the UI)

### W1-1 · Dealer↔customer messaging (both directions)

```
Context: A messages table exists (schema.ts ~471) and full send/read/folder messaging is already implemented for ADMIN (routes/admin.ts ~1367-1490) and CUSTOMER (routes/customerFeatures.ts ~256+). Two gaps: (1) dealers have NO messaging routes at all and are forced to mailto:/tel: (BookingRequests.tsx, Leads.tsx); (2) the customer MessagesPage is receive-only — there is no compose/reply. The dealer's own plan even meters a "Messages" quota (SubscriptionBilling.tsx) for a feature they can't use.

Task:
1. Backend: add dealer messaging routes in routes/dealer.ts (or a new dealerMessages section) mirroring the customer/admin message service — GET /api/dealer/messages (+ unread-count), POST /api/dealer/messages (compose to a customer the dealer has a rental/booking relationship with — enforce that relationship in the WHERE, same pattern as documentAccess), PATCH /:id/read, PATCH /:id/folder. Reuse the existing message service helpers; do not duplicate logic.
2. Backend: add a customer send/reply route POST /api/customer/messages (to the dealer on one of the customer's own rentals/bookings) if not already present, and ensure threads link by a conversation/subject key.
3. Frontend (apps/dealer): add a Messages page + nav item; list threads, open a thread, compose/reply. Wire the "Contact customer" affordance on BookingRequests and Rentals to open an in-app thread instead of mailto:.
4. Frontend (apps/customer): add compose/reply to MessagesPage so the inbox is two-way.
5. Emit an in-app notification (services/notify.ts) to the recipient on every new message.

Acceptance: a dealer can message a customer they have an active rental with and is blocked from messaging an unrelated customer (test); the customer can reply; both see the thread; unread counts update. Relationship scoping is enforced server-side.
```

### W1-2 · Condition photos on handover & return

```
Context: RentalHandoverInput and RentalReturnInput already include photos?: string[], and routes/dealer.ts persists up to 20 photos on handover (~535) and return (~560). But the dealer handover/return modals (apps/dealer Rentals.tsx ~251-297) only render mileage/fuel/notes and submit no photos. The single best dispute-prevention tool is one wire away.

Task: Add a multi-photo uploader to the handover and return modals in apps/dealer Rentals.tsx. Upload via the existing uploads endpoint (multer, /api/uploads) to get stored URLs, then include them in the photos[] field already accepted by the handover/return calls. Show thumbnails, allow remove-before-submit, cap at the backend's 20. Display captured photos on the rental detail view for later reference (and surface them to admin in the rental drill-down if easy).

Acceptance: photos selected in the handover/return modal are uploaded and persisted on the rental_event and visible afterward; submitting with zero photos still works (photos optional). No backend change needed beyond confirming the persist path.
```

### W1-3 · Deposit release / withhold on return

```
Context: rentals.depositAmount and depositRefundable exist (schema.ts ~304-305) and invoices.depositAmount exists (~360), but the return flow (apps/dealer Rentals.tsx ~589-667 + routes/dealer.ts return handler → services/rentalLifecycle.ts recordReturn) only records mileage/fuel/notes. There is no way to release, partially withhold, or deduct damages from the deposit — the financial core of a return.

Task:
1. Backend: extend the return handler / recordReturn to accept a deposit resolution: releaseAmount, withheldAmount, and a reason/itemized note (withheld for damages). Persist the outcome (add deposit_resolved_amount / deposit_withheld_amount / deposit_note columns to rentals in schema.ts + bootstrap.sql + migration, or a small rental_deposit_resolutions row). Do it inside the existing return transaction. Validate withheld + released ≤ depositAmount. Audit it.
2. If a deposit is refundable and released, create the appropriate ledger/refund record consistent with how the codebase handles money out (follow the refund pattern in admin.ts; do NOT invent a new payout path). If unsure whether a real refund is issued vs. recorded, record the intent and flag for finance rather than moving money silently.
3. Frontend (apps/dealer): add a deposit-resolution step to the return modal (release full / withhold amount + reason). Show the deposit outcome on the completed rental.

Acceptance: a return can release or partially withhold the deposit with a reason; withheld+released cannot exceed the deposit (test); the outcome is auditable and visible. Keep the existing return transition intact.
```

### W1-4 · Admin KYC document viewer

```
Context: customer_profiles.qidDocumentPath and driversLicensePath are stored and servable via the authenticated proxy GET /api/uploads/documents/file (uploads.ts), and routes/admin.ts (~377) already returns qidDocumentPath in the customer payload. But apps/admin CustomersPage.tsx (~433-439) renders only a verified/unverified dropdown — the operator verifies KYC BLIND.

Task: In apps/admin CustomersPage (customer detail), add a secure document viewer that fetches the QID and driver's-license images through the authenticated documents proxy (send credentials, render as an image/PDF in a modal). Add explicit "Approve / Reject" verification actions with an optional reason, writing the verification state (and reason) via the existing verification endpoint; audit the decision. Ensure the admin document fetch is authorized server-side (admin override already exists in uploads.ts documentAccess — confirm and reuse).

Acceptance: an admin can open and view a customer's QID and license before setting verification; approving/rejecting records who/when/why in the audit log. Documents are never exposed via a public/static URL.
```

### W1-5 · Dealer-initiated rental extend / modify

```
Context: services/rentalExtension.ts extendRentalTerm exists but is scoped to customerId only (~19-20) with no dealer route. If a customer phones the dealer to extend, the dealer has no button. (Note: the audit flagged extendRentalTerm as non-transactional — wrap it in a db.transaction + row lock as part of this.)

Task:
1. Backend: add POST /api/dealer/rentals/:id/extend that resolves getDealerOrThrow(sub), verifies the rental belongs to this dealer, and calls a shared extendRentalTerm made role-agnostic (accept an actor context). Wrap the extension in a db.transaction with SELECT ... FOR UPDATE on the rental so the read-modify-write of total_amount is atomic. Audit the extension with the dealer as actor.
2. Frontend (apps/dealer): add an "Extend" action on active rentals with a months input and a confirmation showing the new end date and added amount.

Acceptance: a dealer can extend one of their own rentals and is blocked from extending another dealer's rental (test); concurrent double-submit cannot double-extend; the extension is audited. The existing customer extend path still works.
```

### W1-6 · Delivery / collection scheduling at checkout

```
Context: The homepage markets "free delivery," and rentals.pickupLocation / pickupDate / pickupTime columns already exist (schema.ts ~286-288), but the customer CheckoutPage collects only a BILLING address and the dealer UI never reads or sets these fields — the promise resolves to nothing.

Task:
1. Frontend (apps/customer CheckoutPage): add a Delivery step — delivery address (or "collect from dealer" option), preferred date, and time slot. Pass these into the booking-request creation payload.
2. Backend: accept and persist deliveryLocation/date/time onto the booking request and carry them onto the rental's pickup fields at approval (booking.ts transition). Validate with zod.
3. Frontend (apps/dealer): surface the requested delivery address/date/time on the booking request and on the reserved rental so the dealer can fulfil it; add a simple "delivery scheduled / delivered" acknowledgement.
4. Add a customer-facing "return/collection" slot picker at cancel time that writes the intended return date/location.

Acceptance: a customer sets a delivery slot at checkout; it appears on the dealer's booking request and rental; data round-trips into the existing pickup columns. Billing address remains separate and unaffected.
```

### W1-7 · Expose customer maintenance / service request

```
Context: A maintenanceRecords table and routes exist for DEALER and ADMIN (routes/dealer.ts, routes/admin.ts), but there is no /api/customer maintenance route or UI, so a customer can't request a service or see maintenance status on their own car.

Task:
1. Backend: add customer maintenance routes: POST /api/customer/rentals/:id/maintenance-requests (create a request scoped to the customer's own active rental — enforce ownership) and GET to list the maintenance/service status for that rental. Reuse the maintenanceRecords model; mark customer-created rows as requests the dealer can accept/schedule. Notify the dealer.
2. Frontend (apps/customer): in the subscription panel, add "Request service / report an issue" with a description + optional photos, and show the status of open maintenance items on the car.
3. Frontend (apps/dealer MaintenancePage): show incoming customer requests and let the dealer accept/schedule/complete them.

Acceptance: a customer can open a maintenance request on their own rental (and cannot on someone else's — test); the dealer sees it and can act; the customer sees status. Reuse the existing maintenance model rather than a parallel one.
```

### W1-8 · Fix the SMS-availability contradiction

```
Context: apps/customer VerificationSection tells the user "Phone verification via SMS is not available in this release," while SecuritySection fully implements SMS send/verify against live /api/customer/security/sms/* endpoints. One screen denies a capability the other screen delivers.

Task: Reconcile the two. The endpoints work, so make VerificationSection use the real SMS send/verify flow (or remove its contradicting copy and link to the working Security flow). Ensure a single source of truth for phone-verification state (verified/unverified) shown consistently in both sections. Confirm the backend SMS provider is actually configured; if SMS is genuinely unavailable in some environments, gate the UI on a capability flag rather than a hardcoded "not available" string.

Acceptance: the two sections no longer contradict; phone verification is either offered (and works) or consistently gated by a real capability flag, with the verified state shown identically in both places.
```

---

# WAVE 2 — Control plane & growth levers

### W2-1 · Runtime business configuration

```
Context: Core marketplace levers are env-only: PLATFORM_COMMISSION_RATE, BILLING_GRACE_DAYS, CANCEL_NOTICE_DAYS, SWAP_ELIGIBLE_DAYS, SUBSCRIPTION_DEPOSIT_AMOUNT (services/billing.ts ~13-25, services/rentalLifecycle.ts ~41), plus PAYMENT_HOLD_TTL_MINUTES etc. An app_settings table exists (with an unused defaultTaxRate). apps/admin SettingsPage edits only companyName/supportEmail/supportPhone.

Task:
1. Backend: store these business knobs in app_settings. Add a config accessor that reads a setting from app_settings with the current env value as fallback (so behavior is unchanged until an admin overrides). Route billing.ts / rentalLifecycle.ts / scheduler reads through this accessor. Cache with a short TTL to avoid a DB hit per calculation.
2. Backend: admin routes GET/PATCH /api/admin/settings/business (requireFullAdmin, zod-validated ranges, audited).
3. Frontend (apps/admin SettingsPage): add a "Business rules" section to view/edit commission rate, grace days, notice period, swap-eligible days, deposit, hold TTL — with validation and a confirmation, since these affect money.

Acceptance: changing the commission rate in the admin UI changes NEW commission calculations without a redeploy (test the accessor + fallback); invalid ranges are rejected; each change is audited. Do not retroactively alter already-computed ledger rows.
```

### W2-2 · Promo-code management (admin)

```
Context: There is no admin promo route — only customer validate/redeem (services/promoCodes.ts). Promo codes exist only via seed/DB, so growth can't launch a promotion without SQL. (If Wave-1/earlier work already added promo admin CRUD, extend rather than duplicate.)

Task:
1. Backend: admin CRUD at /api/admin/promo-codes (requireFullAdmin, audited, zod): create (code, discountType percent|fixed, value, maxUses, perCustomerLimit, validFrom/validUntil, applies-to first-invoice-only flag), list with usage stats, update (enable/disable), delete. Add a UNIQUE(promo_code_id, customer_id) redemption guard if not already present.
2. Frontend (apps/admin): a Promos page — table of codes with redemptions/remaining, create/edit modal, enable/disable toggle.

Acceptance: an admin creates a code, a customer redeems it, the admin sees the redemption count and can disable it; per-customer and max-use limits are enforced. Redemption stays atomic within settlement (don't regress the money path).
```

### W2-3 · Feature flags / kill switch

```
Context: There are no feature flags or kill switches; ops cannot disable checkout/payments/new-signups during an incident without a redeploy.

Task:
1. Backend: a feature_flags concept in app_settings (e.g. flags: {checkout_enabled, online_payments_enabled, signups_enabled, dealer_signups_enabled}). Add middleware/guards that return a clear 503 "temporarily unavailable" on the relevant routes (booking creation, payment intent creation, signup) when the corresponding flag is off. Read via the cached config accessor from W2-1.
2. Backend: GET/PATCH /api/admin/settings/flags (requireFullAdmin, audited).
3. Frontend (apps/admin): toggles in Settings with an obvious danger styling and confirmation. Frontend apps should degrade gracefully — show a friendly "temporarily paused" message when a flag-gated action returns 503.

Acceptance: turning off online_payments blocks new payment-intent creation with a 503 and a clear message, without affecting existing rentals or the scheduler; toggling is audited. Flags default to enabled.
```

### W2-4 · Staff lifecycle + first-admin bootstrap

```
Context: staff_invites exists but adminFeatures.ts (~140) rejects any role except finance/ops/support, so you cannot invite another admin; there is no GET of ACTIVE staff members, no deactivate/offboard, and no resend/revoke invite. The first admin can only be created via db/push.ts → bootstrap.sql (raw SQL).

Task:
1. Backend: add a first-admin bootstrap CLI command under apps/backend/scripts (e.g. create-admin.ts) that creates exactly one admin from prompted/env credentials and REFUSES if any admin already exists. Wire an npm script.
2. Backend: allow inviting an 'admin' role via the staff invite route (keep it requireFullAdmin + audited). Add GET /api/admin/staff (list active staff members with role + status), and PATCH /api/admin/staff/:id/deactivate (revoke sessions via revokeAllRefreshSessions + set status), plus resend/revoke pending invite routes.
3. Frontend (apps/admin StaffPage): show active staff (not just pending invites), allow inviting any portal role incl. admin, deactivate a member, resend/revoke an invite.

Acceptance: the bootstrap command creates one admin and refuses on re-run; an admin can invite another admin, see active staff, and deactivate a departing employee (which revokes their sessions) — all audited and all without SQL.
```

### W2-5 · Broadcast / segmented communications

```
Context: POST /api/admin/messages (admin.ts ~1437) writes to a single toUserId. There is no way to announce to all customers, all dealers, or a segment (e.g. overdue customers).

Task:
1. Backend: POST /api/admin/broadcasts (requireFullAdmin, audited) that targets a segment — all_customers, all_dealers, overdue_customers, active_subscribers, pending_dealers — and fans out in-app notifications (services/notify.ts) and optional email (through the outbox if it exists, else the mail service), batched to avoid overload. Record the broadcast (a broadcasts table: segment, subject, body, sent_count, created_by) so it's auditable and not re-sent.
2. Frontend (apps/admin): a Broadcasts/Announcements screen — choose segment, preview the recipient count, compose subject/body, choose channels (in-app / email), send with confirmation, and see past broadcasts.

Acceptance: an admin sends an announcement to all dealers and every dealer receives an in-app notification (test with a small seeded set); the broadcast is recorded with an accurate sent_count; sending is audited and rate-safe.
```

---

# WAVE 4 — Experience depth

> Two items here depend on EXTERNAL capabilities. Do not fabricate them:
> - **Saved-card one-tap renewal** requires SkipCash card tokenization / recurring support. If the SkipCash integration (services/skipcash.ts) has no tokenization API, implement the UI/data model behind a capability flag and clearly stub the charge step with a TODO — do NOT claim to store PANs (the app already says cards are "for reference only").
> - **WhatsApp channel** requires a WhatsApp Business API / provider (e.g. Meta Cloud API, Twilio). Build a provider-abstracted notification channel; if no credentials are configured, fall back to the existing channels and log — don't hardcode a vendor.

### W4-1 · Rich car media & specifications

```
Context: The Vehicle type stores a single imageUrl and CarDetailPage renders one <img>; features is a hardcoded empty array; there is no description, mileage cap, deposit, color, or options. AddVehicleModal already has a 6-photo UI that silently drops 5 (only imageUrls[0] is submitted).

Task:
1. Schema: add imageUrls text[] (gallery), description, color, mileageCapKm, and a features/options jsonb to vehicles (schema.ts + bootstrap.sql + migration). Keep imageUrl as the primary/first for backward compat.
2. Backend: accept and return these fields on dealer create/edit and customer vehicle detail; include them in vehicle search results where useful.
3. Frontend (apps/dealer AddVehicleModal): actually submit all uploaded photos to imageUrls and add description/color/mileage-cap/features inputs.
4. Frontend (apps/customer CarDetailPage): render a photo gallery, description, spec grid, features list, mileage cap, and deposit.
5. Re-enable the Features filter in browse now that the data exists.

Acceptance: a dealer uploads multiple photos + specs and the customer sees a real gallery and full spec sheet; no photos are dropped; the features filter returns correct results.
```

### W4-2 · Availability by date & location

```
Context: Vehicles have no location/branch/geo field and browse is a flat pageSize:20 list, so there is no "cars near me / available on my start date." (Assumes the server-side browse pagination/filtering from the earlier fix-pack is in place; if not, do that first.)

Task:
1. Schema: add a location/branch (city/area + optional lat/lng) to vehicles or a dealer branch reference (schema.ts + bootstrap.sql + migration).
2. Backend: extend GET /api/customer/vehicles to filter by location/area and by availability for a requested start date (a vehicle with an open rental or a pending hold covering that date is unavailable). Return the location on each result.
3. Frontend (apps/customer): add a location filter and a start-date input to browse; show location on cards and detail; hide/mark unavailable cars for the chosen date.

Acceptance: filtering by area returns only cars in that area; a car already rented on the requested start date is excluded/marked unavailable. Keep pagination server-driven.
```

### W4-3 · Payment-failure retry

```
Context: apps/customer PaymentStatusPage "Payment failed" only offers "Browse cars" — the customer must rebuild the entire cart + KYC to try again. Biggest single funnel leak.

Task: On the failed/timeout state, add a "Try again" action that re-initiates a fresh SkipCash intent for the SAME booking/invoice (reuse the existing hold/booking where valid rather than forcing a new checkout). Ensure server-side that retrying doesn't create a duplicate booking or a second pending payment for the same booking (the unique-pending-payment index should hold — verify). Preserve the cart/context so the customer lands back in the flow. Also expose retry for a failed invoice payment from the subscription panel.

Acceptance: after a failed payment the customer can retry with one tap without re-entering documents; retrying does not create duplicate bookings or double holds (test); a successful retry settles normally.
```

### W4-4 · Subscription pause / hold

```
Context: The subscription panel offers extend/swap/cancel but no pause/hold — a top expat ask ("pause my car while I travel"). No route exists.

Task:
1. Backend: add a pause capability to the rental lifecycle (services/rentalLifecycle.ts): a 'paused' state (or a pause window on the rental) reachable from 'active', with rules — max pause duration, no invoice generation during the pause (billing.ts must skip paused rentals), and next_billing_date shifted by the paused span on resume. Enforce transitions server-side (paused ↔ active) for all roles. Add POST /api/customer/rentals/:id/pause and /resume (scoped to owner), and a dealer/admin equivalent. Audit it.
2. Frontend (apps/customer): a "Pause subscription" action with the rules explained (max duration, billing resumes on X), and a "Resume" action.

Acceptance: pausing an active subscription stops invoice generation for the pause window and shifts billing on resume (test the billing skip + date shift); illegal transitions return 409; pause/resume are audited. Do not allow pausing a past_due rental.
```

### W4-5 · Reviews display & management

```
Context: submitRentalReview exists (write-only) and rental_reviews is stored, but CarDetailPage/CarCard show rating:0 and there is no read/display endpoint and no dealer response. Reviews are invisible at the decision point.

Task:
1. Backend: add GET endpoints to fetch a vehicle's (and a dealer's) reviews + aggregate rating; compute and return the real average on vehicle detail/list. Add a dealer route to respond to a review (one response per review, audited).
2. Frontend (apps/customer): show the aggregate rating + review list on CarDetailPage and the real rating on cards.
3. Frontend (apps/dealer): a Reviews view listing customer reviews with a "respond" action.

Acceptance: a submitted review appears on the car detail page with the correct aggregate; a dealer can post one response; ratings on cards reflect real data instead of 0.
```

### W4-6 · Roadside / incident reporting

```
Context: An active driver has no emergency path — only a generic complaint form; roadside lives in FAQ prose.

Task: Add a structured incident report on the customer's active rental: type (accident / breakdown / roadside / theft), description, photos, location text, and an emergency contact display. Backend: POST /api/customer/rentals/:id/incidents (owner-scoped), store as an incident record, notify the dealer and admin immediately (in-app + email), and surface it in the dealer rental view and admin ops. Frontend (apps/customer): a prominent "Report an incident / get help" action on the active car with the dealer + roadside contact numbers shown.

Acceptance: a customer files an incident on their rental; the dealer and admin are notified in real time and can see the details/photos; the report is scoped to the owner (test).
```

### W4-7 · Digital rental contract + e-signature

```
Context: Nothing generates or captures a signed rental agreement. pdfDocuments.ts already generates invoice/contract PDFs. In Qatar the signed contract + QID is the basis for police/Salik liability.

Task: Generate a rental-agreement PDF (reuse services/pdfDocuments.ts) populated from the rental, vehicle, dealer, and customer/KYC data at approval/handover. Add a signature-capture step (typed or drawn signature stored as an image + a signed_at timestamp + IP/request id) at handover — customer signs, dealer countersigns. Store the signed contract reference on the rental and make it downloadable by customer, dealer, and admin. Backend routes to record the signature and fetch the signed contract (relationship-scoped). Audit the signing.

Acceptance: at handover a contract is generated, both parties sign, the signed PDF is stored and downloadable by the authorized parties, and the signing event is audited. Unauthorized users cannot fetch another rental's contract.
```

### W4-8 · Saved-card one-tap renewal  (EXTERNAL DEPENDENCY — read the note above)

```
Context: BillingSection stores cards "for reference only"; every payment re-redirects to the SkipCash hosted page. One-tap renewal needs SkipCash tokenization/recurring support.

Task: FIRST inspect services/skipcash.ts and the SkipCash integration for any tokenization / saved-instrument / recurring capability. IF it exists: implement save-card-on-first-payment and a one-tap "pay with saved card" for invoices, storing only the provider token (never the PAN). IF it does NOT exist: implement the data model + UI behind a capability flag (default off), stub the charge with a clear TODO and a message that hosted-redirect is used, and DO NOT store card numbers. Report which path you took and exactly what SkipCash capability is required to finish.

Acceptance: either real tokenized one-tap payment works end-to-end, or the feature is cleanly flagged-off with no PAN storage and a precise note on the missing SkipCash capability. Never store raw card data.
```

### W4-9 · WhatsApp notification channel  (EXTERNAL DEPENDENCY — read the note above)

```
Context: WhatsApp is the dominant channel in Qatar but exists only as manual click-to-chat deep links; notification prefs cover email/SMS/push. There is no WhatsApp sending integration.

Task: Add a provider-abstracted WhatsApp channel to the notification layer (alongside services/mail.ts): a WhatsAppProvider interface with a Meta Cloud API (or Twilio) implementation selected by env, sending templated messages for key events (booking approved, invoice due/overdue, payment received). Add a whatsApp toggle to customer notification preferences and route those events through the channel when enabled and credentials are configured; otherwise fall back to email/in-app and log. Do NOT hardcode a vendor or credentials.

Acceptance: with a provider configured, an enabled customer receives a WhatsApp message on invoice-due (mock the provider in tests); with no provider configured, the system falls back gracefully and never crashes. Preferences persist.
```

### W4-10 · Referrals & loyalty (net-new; scope small first)

```
Context: No referrals or loyalty anywhere. These drive growth heavily in this segment.

Task (MVP scope only): Add a referral system — each customer gets a referral code; a new signup can enter one; on the referred customer's first successful subscription payment, credit both parties (a store-credit ledger applied to the next invoice, or a promo-style discount — reuse the promo/credit primitives rather than a new money path). Backend: referral code generation, redemption at signup, and the credit grant hooked into the settlement of the first invoice (idempotent). Frontend (apps/customer): "Refer a friend" screen with the code/share link, and a referral-status view. Keep loyalty/points OUT of this prompt — referrals only.

Acceptance: a referred customer's first payment credits both accounts exactly once (idempotent — test); the credit reduces a subsequent invoice; codes are unique per customer. Do not create a parallel money-movement path — reuse promo/credit mechanics.
```

---

### Suggested order
Wave 1 first (W1-1 → W1-8) for fast visible wins on existing plumbing. Then Wave 2 (W2-1 → W2-5) to get operators off SQL. Then Wave 4 by value: W4-3 (retry) and W4-1 (media) first, then W4-2, W4-5, W4-4, W4-6, W4-7, then the external-dependency items W4-9 / W4-8, and W4-10 last.

Run `npm run test:api && npm run test && npm run lint:strict` after each prompt and commit on green. For any prompt that adds a table/column, confirm it landed in schema.ts, bootstrap.sql, AND a drizzle migration before moving on.
```
