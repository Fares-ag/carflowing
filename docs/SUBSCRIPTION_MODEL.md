# CarFlow Subscription Model

CarFlow runs an **invygo/FINN-style monthly car subscription**: one all-inclusive
monthly price per car, a minimum term chosen at checkout, rolling monthly renewal
afterwards, car swaps within the dealer's fleet, and cancellation with notice.
This document is the source of truth for how the engine works.

## Comparison: Invygo vs FINN vs CarFlow

| Aspect | [Invygo](https://www.invygo.com/) (primary) | [FINN](https://www.finn.com/) (secondary) | CarFlow |
|--------|---------------------------------------------|---------------------------------------------|---------|
| Pricing | One monthly all-inclusive fee | Fixed monthly fee, longer commitments | `pricePerDay × 30` with term discounts |
| Minimum term | 1–9+ months at signup | Often 6/12 months | 1, 3, 6, 9, or 12 months (`SUBSCRIPTION_DURATION_OPTIONS`) |
| Due at checkout | First month (+ optional starter fee) | First month | First month (SkipCash) or due at pickup — no VAT line items |
| After minimum | Renews monthly until cancelled | Continues to term end | Rolling monthly invoices via scheduler |
| Swap | After ~30 days, same fleet | Typically at term end | `SWAP_ELIGIBLE_DAYS` (default 30), same dealer |
| Cancel | 30-day notice after minimum | Fixed-term commitment | `CANCEL_NOTICE_DAYS` + minimum term + billing boundary |
| Deposit | Low / none | Varies | Optional `SUBSCRIPTION_DEPOSIT_AMOUNT` (default 0) |
| Payments | Card on file / recurring | Recurring | SkipCash hosted pay link per invoice (no card-on-file) |

**Product stance:** Qatar/GCC UX follows **Invygo** (flexible terms, mid-term swap).
**FINN-style** longer terms (12 months) are offered for better monthly rates; the
billing engine still uses invygo-style monthly renewal and swap rules.

## The lifecycle

```
Browse → Checkout (term = N months)
   ├── Pay at shop  → booking request (pending)
   └── Pay online   → booking request HOLD (awaiting_payment) → SkipCash → webhook → visible request
Dealer approves → RENTAL (reserved) + first invoice (paid if online, due if at shop)
Dealer records payment (if due) → Handover (mileage/fuel/condition/photos) → ACTIVE
   … monthly: invoice generated at next_billing_date → customer pays online or at dealer …
   … missed payment: invoice overdue → subscription PAST_DUE → paying restores ACTIVE …
   … swap: customer requests (after 30 days) → dealer approves → car exchanged, price re-anchored …
Cancel (30-day notice, ≥ minimum term, at a billing boundary) → Return + inspection → COMPLETED
```

### Rental/subscription states

`reserved → active → (past_due ↔ active) → completed`, with `cancelled`
reachable from `reserved` (anyone) and from any open state (admin). All
transitions are enforced server-side (`services/rentalLifecycle.ts`); illegal
transitions return 409 for every role, including admins.

### Vehicles

`available → rented` happens only inside the approval transaction. A vehicle
with an open rental can never be hand-flipped back to `available` — end the
rental through return/cancel instead. One open rental per vehicle is enforced
by a partial unique index in the database.

## Customer UX (`packages/shared/src/subscription.ts`)

Shared helpers drive browse, cart, and checkout copy:

- **`SUBSCRIPTION_DURATION_OPTIONS`** — term chips (1–12 months) with discounts
- **`SUBSCRIPTION_VALUE_PROPS`** — all-inclusive, swap, cancel-notice messaging
- **`SUBSCRIPTION_PRICING_LABELS`** — consistent monthly / due today / minimum-term copy
- **`computeSubscriptionMonthly`** — discounted monthly price
- **`computeFirstMonthDue`** — amount charged at SkipCash checkout
- **`computeMinimumTermTotal`** — term total for cart summary (not charged upfront online)

Dealer **Subscription Billing** page is the dealer SaaS platform plan only;
customer car subscriptions are managed under Rentals / Booking Requests.

## Billing engine (`services/billing.ts` + `services/scheduler.ts`)

- **First invoice** is created inside the approval transaction: `paid` and
  linked to the online payment when the customer paid on SkipCash, `due`
  (payable at pickup) otherwise. Handover requires the first invoice paid.
- **Qatar pricing:** all-inclusive monthly amounts with **no sales tax** applied or shown.
- **Optional deposit** via `SUBSCRIPTION_DEPOSIT_AMOUNT` (default 0, invygo-style).
- **Renewals:** a sweep generates the next monthly invoice when
  `next_billing_date` arrives, advances the anchor, notifies + emails the
  customer with a pay link. Idempotent via a unique `(rental_id,
  period_start)` index.
- **Dunning:** invoices unpaid past `due_date` (+`BILLING_GRACE_DAYS`) become
  `overdue` and the subscription drops to `past_due`. Settling the invoice
  (online or offline) restores `active` automatically.
- **Cancellation:** `POST /customer/rentals/:id/cancel`. Reserved → immediate
  (paid money flagged for refund). Active → effective at the first billing
  boundary satisfying both the `CANCEL_NOTICE_DAYS` notice and the minimum
  term; billing stops at that boundary; the car comes back through the normal
  dealer return flow.
- **Payments:** SkipCash has no card-on-file/recurring API, so renewals are
  **invoice + hosted pay link** (`POST /payments/skipcash/invoice-intent`) or
  recorded offline by the dealer (amount always server-derived from the
  invoice). All SkipCash outcomes — webhook or reconciliation — go through one
  row-locked settlement path (`services/paymentSettlement.ts`).
- **Partial refunds** accumulate on payment rows; admin can attest manual refunds.

### Jobs

An in-process scheduler (advisory-locked, safe on multiple instances) runs
every `JOBS_INTERVAL_MS`: invoice generation, dunning, reconciliation of
pending SkipCash payments older than `PAYMENT_RECONCILE_AFTER_MINUTES`
(heals lost webhooks), payout commission accrual, and release of abandoned
online-payment holds after `PAYMENT_HOLD_TTL_MINUTES`. Disable with
`ENABLE_JOBS=false`; tests call `runJobsOnce()` deterministically.

## Swaps (`swap_requests`)

Active subscribers may request a swap `SWAP_ELIGIBLE_DAYS` after handover, to
an **available vehicle of the same dealer**. One pending request per rental
(DB-enforced). Dealer approval atomically: frees the old car, rents the new
one, moves the rental, re-anchors `monthly_amount` to the new car's price
(effective next billing), and records `swap_out`/`swap_in` events with
mileage. Declines require a reason.

## Physical-world record (`rental_events`)

Every handover, return, and swap writes an event with mileage, fuel level,
condition notes, and photo URLs; returns route the vehicle to `available` or
`maintenance`. The vehicle's odometer is kept current from these events.

## Money integrity

- Client never chooses amounts: first-month charge, invoice amounts, and
  offline payments are all server-derived.
- Online-payment **holds** prevent two customers paying for one car; the
  second customer is blocked *before* checkout, not refunded after.
- Refunds are **honest**: a payment is only marked refunded when SkipCash
  confirms, or when an admin explicitly attests a manual refund
  (`manualConfirmed: true`). Partial refunds create `type='refund'` payment
  rows and accumulate `refunded_amount`.
- Deleting vehicles/dealers with rental history is refused (plus RESTRICT
  FKs); customer account deletion anonymizes instead of destroying history.
- Every privileged/money action lands in the append-only `audit_logs` table
  (admin → Audit Log page).
- **Dealer payouts / commission** accrue via `commission_ledger` and admin payout runs.

## Configuration

See `.env.example`: `ENABLE_JOBS`, `JOBS_INTERVAL_MS`, `BILLING_GRACE_DAYS`,
`CANCEL_NOTICE_DAYS`, `SWAP_ELIGIBLE_DAYS`, `SUBSCRIPTION_DEPOSIT_AMOUNT`,
`PAYMENT_HOLD_TTL_MINUTES`, `PAYMENT_RECONCILE_AFTER_MINUTES`. Production boot
refuses missing SkipCash keys and the previously-committed (compromised)
webhook keys.

## Not in scope yet (deliberate)

Proration on mid-cycle swaps, excess-mileage charges, multi-provider payments
beyond the SkipCash + stub second PSP, and full Arabic UI wiring (basic i18n
keys exist; most screens remain English). The mileage data to support
excess-km billing is already being captured via `rental_events`.
