import { and, asc, count, desc, eq, inArray, isNotNull, lt, lte, ne, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { dealerInvoices, dealerPlans, dealerSubscriptions, vehicles } from '../db/schema.js'
import {
  addDays,
  daysBetween,
  dateInBillingTz,
  maxDate,
  nextBoundaryAfter,
  nextBoundaryOnOrAfter,
  todayISO,
  zonedDayStartUtc,
} from '../utils/dates.js'
import { getBillingGraceDays, getCancelNoticeDays } from './appSettings.js'
import { logAudit, type DbOrTx } from './audit.js'
import { notifyDealerOwner } from './notify.js'

/**
 * Dealer subscription billing.
 *
 * Mirrors services/billing.ts (the customer engine): anchor-based monthly
 * periods, invoices due `BILLING_GRACE_DAYS` after the period opens, a dunning
 * pass that flips unpaid invoices and their subscription to past_due, and an
 * idempotent sweep that is safe to re-run on every scheduler tick.
 *
 * PLAN-CHANGE POLICY (the customer engine's precedent, documented here because
 * both options were on the table):
 *  - UPGRADE is applied immediately and is *never* free — exactly like a
 *    customer subscription, which goes active on approval carrying a `due`
 *    invoice payable within the grace window (billing.ts createFirstInvoice).
 *    A brand-new subscription is invoiced the full monthly price; an upgrade
 *    mid-period is invoiced the pro-rated price *difference* for the days that
 *    remain, so the dealer is never charged twice for the same days. Failing to
 *    pay it walks the dealer through past_due and then down to the free tier —
 *    the plan is paid for or it is lost.
 *  - DOWNGRADE to a cheaper tier applies immediately with no refund and no
 *    credit note: the invoice already issued for the running period stands, and
 *    the lower price takes effect from the next boundary. Entitlements (the
 *    vehicle cap) drop straight away, which is why a downgrade deactivates the
 *    dealer's surplus listings.
 *  - CANCELLATION is scheduled, not immediate, matching the customer engine's
 *    notice semantics (rentalLifecycle.ts): `cancel_at` snaps to a billing
 *    boundary no earlier than today + cancel-notice days and never inside a
 *    period the dealer has already been billed for. The sweep executes it at
 *    the boundary by dropping the dealer to the free tier.
 */

/** Statuses whose subscription is still billable. */
const BILLABLE_STATUSES = ['active', 'past_due'] as const

/** Money rounding used across the billing engine (billing.ts). */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

type DealerPlanRow = typeof dealerPlans.$inferSelect
type DealerSubscriptionRow = typeof dealerSubscriptions.$inferSelect
type DealerInvoiceRow = typeof dealerInvoices.$inferSelect

export interface DealerPlanView {
  id: string
  code: string
  name: string
  priceQar: number
  /** Null means unlimited listings. */
  vehicleLimit: number | null
  features: string[]
  active: boolean
}

export interface DealerSubscriptionView {
  id: string
  dealerId: string
  planId: string
  planCode: string
  planName: string
  priceQar: number
  vehicleLimit: number | null
  status: DealerSubscriptionRow['status']
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAt?: string
  createdAt: string
}

export interface DealerInvoiceView {
  id: string
  dealerId: string
  subscriptionId: string
  amount: number
  status: DealerInvoiceRow['status']
  date: string
  description: string
  periodStart: string
  periodEnd: string
  dueDate: string
  paidAt?: string
  paymentId?: string
}

export function mapDealerPlan(row: DealerPlanRow): DealerPlanView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    priceQar: Number(row.priceQar),
    vehicleLimit: row.vehicleLimit ?? null,
    features: row.features ?? [],
    active: row.active,
  }
}

export function mapDealerSubscription(
  row: DealerSubscriptionRow,
  plan: DealerPlanRow
): DealerSubscriptionView {
  return {
    id: row.id,
    dealerId: row.dealerId,
    planId: row.planId,
    planCode: plan.code,
    planName: plan.name,
    priceQar: Number(plan.priceQar),
    vehicleLimit: plan.vehicleLimit ?? null,
    status: row.status,
    currentPeriodStart: dateInBillingTz(row.currentPeriodStart),
    currentPeriodEnd: dateInBillingTz(row.currentPeriodEnd),
    cancelAt: row.cancelAt ? dateInBillingTz(row.cancelAt) : undefined,
    createdAt: row.createdAt.toISOString(),
  }
}

export function mapDealerInvoice(row: DealerInvoiceRow, planName?: string | null): DealerInvoiceView {
  const periodStart = dateInBillingTz(row.periodStart)
  const periodEnd = dateInBillingTz(row.periodEnd)
  return {
    id: row.id,
    dealerId: row.dealerId,
    subscriptionId: row.subscriptionId,
    amount: Number(row.amount),
    status: row.status,
    date: periodStart,
    description: `${planName ?? 'Dealer plan'} subscription ${periodStart} -> ${periodEnd}`,
    periodStart,
    periodEnd,
    dueDate: dateInBillingTz(row.dueDate),
    paidAt: row.paidAt?.toISOString(),
    paymentId: row.paymentId ?? undefined,
  }
}

/** Active plans, cheapest first (the order the dealer portal renders tiers in). */
export async function listDealerPlans(executor: DbOrTx = db): Promise<DealerPlanRow[]> {
  return executor
    .select()
    .from(dealerPlans)
    .where(eq(dealerPlans.active, true))
    .orderBy(asc(dealerPlans.priceQar), asc(dealerPlans.createdAt))
}

/**
 * The tier a delinquent or cancelled dealer falls back to: the cheapest active
 * plan that costs nothing. Deployments without a zero-priced plan have no free
 * tier, and the fallback is a cancelled subscription instead.
 */
export async function findFreeDealerPlan(executor: DbOrTx = db): Promise<DealerPlanRow | null> {
  const [plan] = await executor
    .select()
    .from(dealerPlans)
    .where(and(eq(dealerPlans.active, true), sql`${dealerPlans.priceQar} = 0`))
    .orderBy(asc(dealerPlans.priceQar), asc(dealerPlans.createdAt))
    .limit(1)
  return plan ?? null
}

/** Guards against Postgres 500ing on a body-supplied id that is not a uuid. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function findDealerPlan(
  executor: DbOrTx,
  ref: { planId?: string; planCode?: string }
): Promise<DealerPlanRow | null> {
  if (ref.planId) {
    if (!UUID_RE.test(ref.planId)) return null
    const [plan] = await executor
      .select()
      .from(dealerPlans)
      .where(and(eq(dealerPlans.id, ref.planId), eq(dealerPlans.active, true)))
      .limit(1)
    return plan ?? null
  }
  if (ref.planCode) {
    const [plan] = await executor
      .select()
      .from(dealerPlans)
      .where(and(eq(dealerPlans.code, ref.planCode), eq(dealerPlans.active, true)))
      .limit(1)
    return plan ?? null
  }
  return null
}

/**
 * The dealer's one open subscription (the partial unique index guarantees at
 * most one that is not cancelled), with its plan.
 */
export async function getDealerSubscription(
  executor: DbOrTx,
  dealerId: string
): Promise<{ subscription: DealerSubscriptionRow; plan: DealerPlanRow } | null> {
  const [row] = await executor
    .select({ subscription: dealerSubscriptions, plan: dealerPlans })
    .from(dealerSubscriptions)
    .innerJoin(dealerPlans, eq(dealerSubscriptions.planId, dealerPlans.id))
    .where(and(eq(dealerSubscriptions.dealerId, dealerId), ne(dealerSubscriptions.status, 'cancelled')))
    .limit(1)
  return row ?? null
}

export async function listDealerInvoices(
  executor: DbOrTx,
  dealerId: string,
  limit = 500
): Promise<{ invoice: DealerInvoiceRow; planName: string | null }[]> {
  const rows = await executor
    .select({ invoice: dealerInvoices, planName: dealerPlans.name })
    .from(dealerInvoices)
    .innerJoin(dealerSubscriptions, eq(dealerInvoices.subscriptionId, dealerSubscriptions.id))
    .innerJoin(dealerPlans, eq(dealerSubscriptions.planId, dealerPlans.id))
    .where(eq(dealerInvoices.dealerId, dealerId))
    .orderBy(desc(dealerInvoices.periodStart), desc(dealerInvoices.createdAt))
    .limit(limit)
  return rows
}

/* ------------------------------------------------------------------ *
 * Vehicle quota
 * ------------------------------------------------------------------ */

export interface DealerVehicleQuota {
  planId: string | null
  planCode: string | null
  planName: string | null
  /** Null means unlimited (either an unlimited tier or a dealer with no subscription). */
  limit: number | null
  used: number
  remaining: number | null
  overLimit: boolean
  /** True when the cap is actually enforceable (the dealer holds a capped plan). */
  enforced: boolean
}

/** Listings that count against the cap: everything the dealer has not shelved. */
async function countListedVehicles(executor: DbOrTx, dealerId: string): Promise<number> {
  const [row] = await executor
    .select({ value: count() })
    .from(vehicles)
    .where(and(eq(vehicles.dealerId, dealerId), ne(vehicles.status, 'inactive')))
  return Number(row?.value ?? 0)
}

/**
 * Current listing headroom. Dealers that predate billing hold no subscription
 * row at all; they are reported as unlimited rather than being locked out of
 * their own inventory the moment this ships.
 */
export async function getDealerVehicleQuota(
  dealerId: string,
  executor: DbOrTx = db
): Promise<DealerVehicleQuota> {
  const current = await getDealerSubscription(executor, dealerId)
  const used = await countListedVehicles(executor, dealerId)
  const limit = current?.plan.vehicleLimit ?? null
  return {
    planId: current?.plan.id ?? null,
    planCode: current?.plan.code ?? null,
    planName: current?.plan.name ?? null,
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
    overLimit: limit !== null && used > limit,
    enforced: limit !== null,
  }
}

/**
 * Server-side enforcement of the advertised plan cap. Throws a 402 the API
 * error handler renders as `{ error }` when the dealer is at or over the cap.
 * Call this BEFORE inserting a vehicle.
 */
export async function checkDealerVehicleQuota(
  dealerId: string,
  executor: DbOrTx = db
): Promise<DealerVehicleQuota> {
  const quota = await getDealerVehicleQuota(dealerId, executor)
  if (quota.limit !== null && quota.used >= quota.limit) {
    throw Object.assign(
      new Error(
        `Your ${quota.planName ?? 'current'} plan allows ${quota.limit} listed vehicle(s) and you have ${quota.used}. Upgrade your plan or deactivate a listing first.`
      ),
      { status: 402 }
    )
  }
  return quota
}

/**
 * Shelves the listings a dealer no longer has room for after a downgrade.
 * Vehicles are never deleted: rented and in-maintenance cars are left alone
 * (a live rental must not vanish from the dealer's fleet) and only surplus
 * `available` cars are flipped to `inactive`, which is the existing
 * "not listed" state a dealer can undo by upgrading again.
 */
async function deactivateSurplusVehicles(
  tx: DbOrTx,
  dealerId: string,
  limit: number | null
): Promise<number> {
  if (limit === null) return 0
  const listed = await tx
    .select({ id: vehicles.id, status: vehicles.status })
    .from(vehicles)
    .where(and(eq(vehicles.dealerId, dealerId), ne(vehicles.status, 'inactive')))
    .orderBy(
      sql`case ${vehicles.status} when 'rented' then 0 when 'maintenance' then 1 else 2 end`,
      asc(vehicles.name)
    )
  const surplus = listed
    .slice(Math.max(0, limit))
    .filter((v) => v.status === 'available')
    .map((v) => v.id)
  if (surplus.length === 0) return 0
  await tx.update(vehicles).set({ status: 'inactive' }).where(inArray(vehicles.id, surplus))
  return surplus.length
}

/* ------------------------------------------------------------------ *
 * Invoicing
 * ------------------------------------------------------------------ */

/**
 * Inserts an open dealer invoice. The (subscription_id, period_start) unique
 * index makes re-running the sweep a no-op, so a conflict returns null rather
 * than raising.
 */
async function insertOpenInvoice(
  tx: DbOrTx,
  params: {
    dealerId: string
    subscriptionId: string
    amount: number
    periodStart: Date
    periodEnd: Date
    dueDate: Date
  }
): Promise<DealerInvoiceRow | null> {
  const [row] = await tx
    .insert(dealerInvoices)
    .values({
      dealerId: params.dealerId,
      subscriptionId: params.subscriptionId,
      amount: String(round2(params.amount)),
      status: 'open',
      periodStart: params.periodStart,
      periodEnd: params.periodEnd,
      dueDate: params.dueDate,
    })
    .onConflictDoNothing()
    .returning()
  return row ?? null
}

export type SettleDealerInvoiceOutcome = 'settled' | 'already-paid' | 'not-payable' | 'not-found'

/**
 * Marks a dealer invoice paid inside the caller's transaction and restores the
 * subscription (past_due -> active once nothing else is owed). Mirrors
 * billing.ts settleInvoice, including its rule of never throwing on a state
 * conflict so a webhook retry cannot loop forever.
 */
export async function settleDealerInvoice(
  tx: DbOrTx,
  params: { invoiceId: string; paymentId?: string | null }
): Promise<SettleDealerInvoiceOutcome> {
  const [invoice] = await tx
    .select()
    .from(dealerInvoices)
    .where(eq(dealerInvoices.id, params.invoiceId))
    .for('update')
    .limit(1)
  if (!invoice) return 'not-found'
  if (invoice.status === 'paid') return 'already-paid'
  if (invoice.status === 'void') return 'not-payable'

  await tx
    .update(dealerInvoices)
    .set({ status: 'paid', paidAt: new Date(), paymentId: params.paymentId ?? null })
    .where(eq(dealerInvoices.id, invoice.id))

  const [outstanding] = await tx
    .select({ value: count() })
    .from(dealerInvoices)
    .where(
      and(
        eq(dealerInvoices.subscriptionId, invoice.subscriptionId),
        inArray(dealerInvoices.status, ['open', 'past_due']),
        ne(dealerInvoices.id, invoice.id)
      )
    )
  if (Number(outstanding?.value ?? 0) === 0) {
    const [subscription] = await tx
      .select()
      .from(dealerSubscriptions)
      .where(eq(dealerSubscriptions.id, invoice.subscriptionId))
      .for('update')
      .limit(1)
    if (subscription && subscription.status === 'past_due') {
      await tx
        .update(dealerSubscriptions)
        .set({ status: 'active' })
        .where(eq(dealerSubscriptions.id, subscription.id))
    }
  }
  await logAudit(tx, {
    action: 'dealer.billing.invoice.paid',
    entityType: 'dealer_invoice',
    entityId: invoice.id,
    after: { amount: Number(invoice.amount), paymentId: params.paymentId ?? null },
  })
  return 'settled'
}

/* ------------------------------------------------------------------ *
 * Plan changes
 * ------------------------------------------------------------------ */

export interface DealerPlanChangeResult {
  subscription: DealerSubscriptionRow
  plan: DealerPlanRow
  /** Set when the change was charged for. */
  invoice: DealerInvoiceRow | null
  change: 'subscribed' | 'upgraded' | 'downgraded' | 'unchanged'
  deactivatedVehicles: number
}

/**
 * Applies a dealer plan change. Upgrades are billed (a brand-new subscription
 * is billed the full month, an in-period upgrade the pro-rated difference);
 * downgrades and free tiers are not.
 */
export async function changeDealerPlan(params: {
  dealerId: string
  planId?: string
  planCode?: string
  actorId?: string | null
  now?: string
}): Promise<DealerPlanChangeResult> {
  const now = params.now ?? todayISO()
  const grace = await getBillingGraceDays()

  return db.transaction(async (tx) => {
    const plan = await findDealerPlan(tx, { planId: params.planId, planCode: params.planCode })
    if (!plan) throw Object.assign(new Error('Plan not found or inactive'), { status: 404 })

    const [existing] = await tx
      .select()
      .from(dealerSubscriptions)
      .where(and(eq(dealerSubscriptions.dealerId, params.dealerId), ne(dealerSubscriptions.status, 'cancelled')))
      .for('update')
      .limit(1)

    const price = Number(plan.priceQar)

    // First subscription: full first period, invoiced up front like a customer
    // subscription's first invoice.
    if (!existing) {
      const periodStart = now
      const periodEnd = nextBoundaryAfter(periodStart, periodStart)
      const [subscription] = await tx
        .insert(dealerSubscriptions)
        .values({
          dealerId: params.dealerId,
          planId: plan.id,
          status: 'active',
          currentPeriodStart: zonedDayStartUtc(periodStart),
          currentPeriodEnd: zonedDayStartUtc(periodEnd),
        })
        .returning()
      const invoice =
        price > 0
          ? await insertOpenInvoice(tx, {
              dealerId: params.dealerId,
              subscriptionId: subscription.id,
              amount: price,
              periodStart: zonedDayStartUtc(periodStart),
              periodEnd: zonedDayStartUtc(periodEnd),
              dueDate: zonedDayStartUtc(addDays(periodStart, grace)),
            })
          : null
      const deactivated = await deactivateSurplusVehicles(tx, params.dealerId, plan.vehicleLimit ?? null)
      await logAudit(tx, {
        actorId: params.actorId ?? null,
        actorRole: 'dealer',
        action: 'dealer.billing.subscribed',
        entityType: 'dealer_subscription',
        entityId: subscription.id,
        after: {
          planCode: plan.code,
          priceQar: price,
          invoiceId: invoice?.id ?? null,
          periodStart,
          periodEnd,
        },
      })
      if (invoice) {
        await notifyDealerOwner(tx, params.dealerId, {
          type: 'info',
          title: 'Subscription invoice due',
          message: `Your ${plan.name} plan invoice of QAR ${round2(price).toFixed(2)} is due by ${addDays(periodStart, grace)}.`,
        })
      }
      return {
        subscription,
        plan,
        invoice,
        change: 'subscribed' as const,
        deactivatedVehicles: deactivated,
      }
    }

    if (existing.planId === plan.id) {
      // Re-selecting the current plan clears a pending cancellation but is
      // never a second charge.
      if (existing.cancelAt) {
        const [resumed] = await tx
          .update(dealerSubscriptions)
          .set({ cancelAt: null })
          .where(eq(dealerSubscriptions.id, existing.id))
          .returning()
        await logAudit(tx, {
          actorId: params.actorId ?? null,
          actorRole: 'dealer',
          action: 'dealer.billing.cancel_reverted',
          entityType: 'dealer_subscription',
          entityId: existing.id,
        })
        return {
          subscription: resumed,
          plan,
          invoice: null,
          change: 'unchanged' as const,
          deactivatedVehicles: 0,
        }
      }
      return {
        subscription: existing,
        plan,
        invoice: null,
        change: 'unchanged' as const,
        deactivatedVehicles: 0,
      }
    }

    const [currentPlan] = await tx
      .select()
      .from(dealerPlans)
      .where(eq(dealerPlans.id, existing.planId))
      .limit(1)
    const currentPrice = Number(currentPlan?.priceQar ?? 0)
    const upgrade = price > currentPrice

    // A dealer who has not paid for the tier they are on cannot buy their way
    // up; settle first (the customer engine likewise refuses to move a
    // past_due subscription forward). The debt is checked, not just the
    // subscription status, so a dealer already dropped to the free tier for
    // non-payment cannot re-subscribe around the unpaid invoice.
    if (upgrade) {
      const [owed] = await tx
        .select({ value: count() })
        .from(dealerInvoices)
        .where(
          and(eq(dealerInvoices.dealerId, params.dealerId), eq(dealerInvoices.status, 'past_due'))
        )
      if (existing.status === 'past_due' || Number(owed?.value ?? 0) > 0) {
        throw Object.assign(
          new Error('Settle your outstanding subscription invoice before changing plan'),
          { status: 402 }
        )
      }
    }

    const periodStartISO = dateInBillingTz(existing.currentPeriodStart)
    const periodEndISO = dateInBillingTz(existing.currentPeriodEnd)

    let invoice: DealerInvoiceRow | null = null
    if (upgrade) {
      // Pro-rate the price DIFFERENCE over the days left in the period the
      // dealer has already been billed for, so the same days are never
      // charged twice.
      const periodDays = daysBetween(periodStartISO, periodEndISO)
      const remainingDays = daysBetween(now, periodEndISO)
      const amount =
        periodDays > 0 ? round2((price - currentPrice) * (remainingDays / periodDays)) : round2(price - currentPrice)
      if (amount > 0) {
        invoice = await insertOpenInvoice(tx, {
          dealerId: params.dealerId,
          subscriptionId: existing.id,
          amount,
          // The exact upgrade instant, not the day boundary: it keeps the
          // (subscription_id, period_start) key clear of the recurring
          // invoice generated on a boundary day.
          periodStart: new Date(),
          periodEnd: zonedDayStartUtc(periodEndISO),
          dueDate: zonedDayStartUtc(addDays(now, grace)),
        })
      }
    }

    const [subscription] = await tx
      .update(dealerSubscriptions)
      .set({ planId: plan.id, cancelAt: null })
      .where(eq(dealerSubscriptions.id, existing.id))
      .returning()

    const deactivated = upgrade
      ? 0
      : await deactivateSurplusVehicles(tx, params.dealerId, plan.vehicleLimit ?? null)

    await logAudit(tx, {
      actorId: params.actorId ?? null,
      actorRole: 'dealer',
      action: upgrade ? 'dealer.billing.upgraded' : 'dealer.billing.downgraded',
      entityType: 'dealer_subscription',
      entityId: subscription.id,
      before: { planCode: currentPlan?.code ?? null, priceQar: currentPrice },
      after: {
        planCode: plan.code,
        priceQar: price,
        invoiceId: invoice?.id ?? null,
        deactivatedVehicles: deactivated,
      },
    })
    if (invoice) {
      await notifyDealerOwner(tx, params.dealerId, {
        type: 'info',
        title: 'Plan upgrade invoice due',
        message: `Your upgrade to ${plan.name} is invoiced at QAR ${Number(invoice.amount).toFixed(2)} for the rest of this period, due by ${addDays(now, grace)}.`,
      })
    }
    return {
      subscription,
      plan,
      invoice,
      change: upgrade ? ('upgraded' as const) : ('downgraded' as const),
      deactivatedVehicles: deactivated,
    }
  })
}

export interface DealerCancelResult {
  subscription: DealerSubscriptionRow
  plan: DealerPlanRow
  effectiveDate: string
}

/**
 * Schedules cancellation at a billing boundary, mirroring the customer
 * engine's notice semantics: never before today + cancel-notice days, never
 * inside the period already invoiced, and always on the subscription's own
 * monthly anchor.
 */
export async function cancelDealerSubscription(params: {
  dealerId: string
  actorId?: string | null
  now?: string
}): Promise<DealerCancelResult> {
  const now = params.now ?? todayISO()
  const notice = await getCancelNoticeDays()

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(dealerSubscriptions)
      .where(and(eq(dealerSubscriptions.dealerId, params.dealerId), ne(dealerSubscriptions.status, 'cancelled')))
      .for('update')
      .limit(1)
    if (!existing) throw Object.assign(new Error('No active subscription'), { status: 404 })
    if (existing.cancelAt) {
      throw Object.assign(new Error('Cancellation is already scheduled'), { status: 409 })
    }
    const [plan] = await tx
      .select()
      .from(dealerPlans)
      .where(eq(dealerPlans.id, existing.planId))
      .limit(1)

    // Snap to a boundary computed from the subscription's own anchor
    // (month-end safe), never before the notice period is served and never
    // inside the period the dealer has already been invoiced for.
    const anchor = dateInBillingTz(existing.createdAt)
    const paidThrough = dateInBillingTz(existing.currentPeriodEnd)
    const target = maxDate(addDays(now, notice), paidThrough)
    const effective = nextBoundaryOnOrAfter(anchor, target)

    const [subscription] = await tx
      .update(dealerSubscriptions)
      .set({ cancelAt: zonedDayStartUtc(effective) })
      .where(eq(dealerSubscriptions.id, existing.id))
      .returning()
    await logAudit(tx, {
      actorId: params.actorId ?? null,
      actorRole: 'dealer',
      action: 'dealer.billing.cancel_scheduled',
      entityType: 'dealer_subscription',
      entityId: subscription.id,
      after: { effectiveDate: effective, planCode: plan?.code ?? null },
    })
    await notifyDealerOwner(tx, params.dealerId, {
      type: 'info',
      title: 'Subscription cancellation scheduled',
      message: `Your ${plan?.name ?? 'dealer'} plan ends on ${effective}. Your listings stay live until then.`,
    })
    return { subscription, plan, effectiveDate: effective }
  })
}

/* ------------------------------------------------------------------ *
 * Sweeps
 * ------------------------------------------------------------------ */

/**
 * Drops a subscription to the free tier without touching the dealer's data.
 * Deployments with no zero-priced plan have nothing to fall back to, so the
 * subscription is cancelled outright and the cap stops being enforced.
 */
async function downgradeToFreeTier(
  tx: DbOrTx,
  subscription: DealerSubscriptionRow,
  reason: 'non_payment' | 'cancelled'
): Promise<{ planCode: string | null; deactivatedVehicles: number }> {
  const free = await findFreeDealerPlan(tx)
  if (!free) {
    await tx
      .update(dealerSubscriptions)
      .set({ status: 'cancelled', cancelAt: new Date() })
      .where(eq(dealerSubscriptions.id, subscription.id))
    return { planCode: null, deactivatedVehicles: 0 }
  }
  await tx
    .update(dealerSubscriptions)
    .set({ planId: free.id, status: 'active', cancelAt: null })
    .where(eq(dealerSubscriptions.id, subscription.id))
  const deactivated = await deactivateSurplusVehicles(
    tx,
    subscription.dealerId,
    free.vehicleLimit ?? null
  )
  await logAudit(tx, {
    action: `dealer.billing.downgraded.${reason}`,
    entityType: 'dealer_subscription',
    entityId: subscription.id,
    after: { planCode: free.code, deactivatedVehicles: deactivated },
  })
  return { planCode: free.code, deactivatedVehicles: deactivated }
}

/**
 * Recurring dealer invoice generation (idempotent). Every billable
 * subscription whose period has ended rolls to the next anchor-based period;
 * paid tiers also get an open invoice due `BILLING_GRACE_DAYS` later.
 */
export async function generateDueDealerInvoices(now = todayISO()): Promise<number> {
  const dayStart = zonedDayStartUtc(now)
  const due = await db
    .select({ id: dealerSubscriptions.id })
    .from(dealerSubscriptions)
    .where(
      and(
        inArray(dealerSubscriptions.status, [...BILLABLE_STATUSES]),
        lte(dealerSubscriptions.currentPeriodEnd, dayStart)
      )
    )
    .limit(500)

  let generated = 0
  for (const row of due) {
    const created = await db.transaction(async (tx) => {
      const [subscription] = await tx
        .select()
        .from(dealerSubscriptions)
        .where(eq(dealerSubscriptions.id, row.id))
        .for('update')
        .limit(1)
      if (!subscription) return false
      if (subscription.status !== 'active' && subscription.status !== 'past_due') return false
      if (subscription.currentPeriodEnd > dayStart) return false

      const periodStart = dateInBillingTz(subscription.currentPeriodEnd)
      // Anchor-based boundary (month-end safe): computed from the
      // subscription's own start, never by iterating on clamped output.
      const anchor = dateInBillingTz(subscription.createdAt)
      const periodEnd = nextBoundaryAfter(anchor, periodStart)

      // Stop billing at the cancellation boundary.
      if (subscription.cancelAt && subscription.cancelAt <= dayStart) return false

      await tx
        .update(dealerSubscriptions)
        .set({
          currentPeriodStart: zonedDayStartUtc(periodStart),
          currentPeriodEnd: zonedDayStartUtc(periodEnd),
        })
        .where(eq(dealerSubscriptions.id, subscription.id))

      const [plan] = await tx
        .select()
        .from(dealerPlans)
        .where(eq(dealerPlans.id, subscription.planId))
        .limit(1)
      const price = Number(plan?.priceQar ?? 0)
      if (price <= 0) return false

      const grace = await getBillingGraceDays()
      const invoice = await insertOpenInvoice(tx, {
        dealerId: subscription.dealerId,
        subscriptionId: subscription.id,
        amount: price,
        periodStart: zonedDayStartUtc(periodStart),
        periodEnd: zonedDayStartUtc(periodEnd),
        dueDate: zonedDayStartUtc(addDays(periodStart, grace)),
      })
      if (!invoice) return false

      await notifyDealerOwner(tx, subscription.dealerId, {
        type: 'info',
        title: 'Subscription invoice due',
        message: `Your ${plan?.name ?? 'dealer'} plan invoice of QAR ${round2(price).toFixed(2)} for ${periodStart} is due by ${addDays(periodStart, grace)}.`,
      })
      await logAudit(tx, {
        action: 'dealer.billing.invoice.generated',
        entityType: 'dealer_subscription',
        entityId: subscription.id,
        after: { invoiceId: invoice.id, periodStart, periodEnd, amount: price },
      })
      return true
    })
    if (created) generated += 1
  }
  return generated
}

/**
 * Dunning: dealer invoices past their grace window become past_due and take
 * the subscription with them, mirroring billing.ts markOverdueInvoices.
 */
export async function markPastDueDealerInvoices(now = todayISO()): Promise<number> {
  const dayStart = zonedDayStartUtc(now)
  const overdue = await db
    .select({ id: dealerInvoices.id })
    .from(dealerInvoices)
    .where(and(eq(dealerInvoices.status, 'open'), lt(dealerInvoices.dueDate, dayStart)))
    .limit(500)

  let flipped = 0
  for (const row of overdue) {
    const done = await db.transaction(async (tx) => {
      const [invoice] = await tx
        .select()
        .from(dealerInvoices)
        .where(eq(dealerInvoices.id, row.id))
        .for('update')
        .limit(1)
      if (!invoice || invoice.status !== 'open') return false
      await tx
        .update(dealerInvoices)
        .set({ status: 'past_due' })
        .where(eq(dealerInvoices.id, invoice.id))
      const [subscription] = await tx
        .select()
        .from(dealerSubscriptions)
        .where(eq(dealerSubscriptions.id, invoice.subscriptionId))
        .for('update')
        .limit(1)
      if (subscription && subscription.status === 'active') {
        await tx
          .update(dealerSubscriptions)
          .set({ status: 'past_due' })
          .where(eq(dealerSubscriptions.id, subscription.id))
      }
      await notifyDealerOwner(tx, invoice.dealerId, {
        type: 'error',
        title: 'Subscription payment overdue',
        message: `Your subscription invoice of QAR ${Number(invoice.amount).toFixed(2)} is overdue. Settle it to keep your plan — unpaid plans drop to the free tier.`,
      })
      await logAudit(tx, {
        action: 'dealer.billing.invoice.past_due',
        entityType: 'dealer_invoice',
        entityId: invoice.id,
        after: { subscriptionId: invoice.subscriptionId, amount: Number(invoice.amount) },
      })
      return true
    })
    if (done) flipped += 1
  }
  return flipped
}

/**
 * Second dunning stage: a subscription still unpaid a full grace window after
 * its invoice went past_due is downgraded to the free tier. The debt is NOT
 * forgiven — the past_due invoices stay on the ledger.
 */
export async function downgradeDelinquentDealers(now = todayISO()): Promise<number> {
  const grace = await getBillingGraceDays()
  const cutoff = zonedDayStartUtc(addDays(now, -grace))
  const delinquent = await db
    .selectDistinct({ id: dealerSubscriptions.id })
    .from(dealerSubscriptions)
    .innerJoin(dealerInvoices, eq(dealerInvoices.subscriptionId, dealerSubscriptions.id))
    .where(
      and(
        eq(dealerSubscriptions.status, 'past_due'),
        eq(dealerInvoices.status, 'past_due'),
        lt(dealerInvoices.dueDate, cutoff)
      )
    )
    .limit(500)

  let downgraded = 0
  for (const row of delinquent) {
    const done = await db.transaction(async (tx) => {
      const [subscription] = await tx
        .select()
        .from(dealerSubscriptions)
        .where(eq(dealerSubscriptions.id, row.id))
        .for('update')
        .limit(1)
      if (!subscription || subscription.status !== 'past_due') return false
      const [stillOwed] = await tx
        .select({ value: count() })
        .from(dealerInvoices)
        .where(
          and(
            eq(dealerInvoices.subscriptionId, subscription.id),
            eq(dealerInvoices.status, 'past_due'),
            lt(dealerInvoices.dueDate, cutoff)
          )
        )
      if (Number(stillOwed?.value ?? 0) === 0) return false
      const result = await downgradeToFreeTier(tx, subscription, 'non_payment')
      await notifyDealerOwner(tx, subscription.dealerId, {
        type: 'error',
        title: 'Plan downgraded to the free tier',
        message: result.planCode
          ? `Your subscription was not paid, so your account moved to the ${result.planCode} tier${result.deactivatedVehicles > 0 ? ` and ${result.deactivatedVehicles} listing(s) were deactivated` : ''}. The outstanding invoice is still due.`
          : 'Your subscription was not paid and has been cancelled. The outstanding invoice is still due.',
      })
      return true
    })
    if (done) downgraded += 1
  }
  return downgraded
}

/** Executes cancellations whose notice period has run out. */
export async function applyScheduledDealerCancellations(now = todayISO()): Promise<number> {
  const dayStart = zonedDayStartUtc(now)
  const due = await db
    .select({ id: dealerSubscriptions.id })
    .from(dealerSubscriptions)
    .where(
      and(
        ne(dealerSubscriptions.status, 'cancelled'),
        isNotNull(dealerSubscriptions.cancelAt),
        lte(dealerSubscriptions.cancelAt, dayStart)
      )
    )
    .limit(500)

  let cancelled = 0
  for (const row of due) {
    const done = await db.transaction(async (tx) => {
      const [subscription] = await tx
        .select()
        .from(dealerSubscriptions)
        .where(eq(dealerSubscriptions.id, row.id))
        .for('update')
        .limit(1)
      if (!subscription || subscription.status === 'cancelled') return false
      if (!subscription.cancelAt || subscription.cancelAt > dayStart) return false
      const result = await downgradeToFreeTier(tx, subscription, 'cancelled')
      await notifyDealerOwner(tx, subscription.dealerId, {
        type: 'info',
        title: 'Subscription ended',
        message: result.planCode
          ? `Your paid plan ended and your account is now on the ${result.planCode} tier.`
          : 'Your paid plan ended and your subscription is now closed.',
      })
      return true
    })
    if (done) cancelled += 1
  }
  return cancelled
}

export interface DealerBillingSweepResult {
  invoices: number
  pastDue: number
  downgraded: number
  cancellations: number
}

/**
 * Single scheduler entrypoint for dealer subscription billing. Idempotent:
 * every stage is keyed on state the previous run already advanced, so
 * re-running inside the same day is a no-op.
 */
export async function runDealerBillingSweep(now = todayISO()): Promise<DealerBillingSweepResult> {
  const cancellations = await applyScheduledDealerCancellations(now)
  const invoices = await generateDueDealerInvoices(now)
  const pastDue = await markPastDueDealerInvoices(now)
  const downgraded = await downgradeDelinquentDealers(now)
  return { invoices, pastDue, downgraded, cancellations }
}
