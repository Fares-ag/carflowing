import crypto from 'node:crypto'
import { and, eq, gt, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { customerCredits, invoices, profiles, referralCodes, referrals } from '../db/schema.js'
import { logAuditSafe } from './audit.js'
import type { DbOrTx } from './audit.js'

export class ReferralError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ReferralError'
  }
}

function referralCreditAmount(): number {
  const n = Number(process.env.REFERRAL_CREDIT_AMOUNT_QAR ?? '50')
  return Number.isFinite(n) && n > 0 ? n : 50
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '')
}

function randomReferralCode(): string {
  return crypto.randomBytes(4).toString('hex').toUpperCase()
}

/** Ensures every customer has a unique referral code (lazy-created on first access). */
export async function ensureReferralCode(userId: string): Promise<string> {
  const [existing] = await db
    .select({ code: referralCodes.code })
    .from(referralCodes)
    .where(eq(referralCodes.userId, userId))
    .limit(1)
  if (existing) return existing.code

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomReferralCode()
    try {
      await db.insert(referralCodes).values({ userId, code })
      return code
    } catch (err) {
      if ((err as { code?: string }).code === '23505') continue
      throw err
    }
  }
  throw new ReferralError('Could not allocate a referral code')
}

/** Records referral attribution at customer signup. */
export async function redeemReferralAtSignup(referredUserId: string, rawCode: string): Promise<void> {
  const code = normalizeCode(rawCode)
  if (!code) return

  const referrer = await lookupReferrerByCode(code)
  if (!referrer) {
    throw new ReferralError('Invalid referral code')
  }
  if (referrer.userId === referredUserId) {
    throw new ReferralError('You cannot use your own referral code')
  }

  try {
    await db.insert(referrals).values({
      referrerUserId: referrer.userId,
      referredUserId,
      referralCode: referrer.code,
      status: 'pending',
    })
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new ReferralError('Referral code already used for this account')
    }
    throw err
  }
}

/** Pre-signup validation (code must exist). */
export async function validateReferralCodeForSignup(rawCode: string): Promise<void> {
  const code = normalizeCode(rawCode)
  if (!code) return
  const referrer = await lookupReferrerByCode(code)
  if (!referrer) {
    throw new ReferralError('Invalid referral code')
  }
}

async function lookupReferrerByCode(code: string): Promise<{ userId: string; code: string } | null> {
  const [row] = await db
    .select({ userId: referralCodes.userId, code: referralCodes.code })
    .from(referralCodes)
    .where(eq(referralCodes.code, code))
    .limit(1)
  return row ?? null
}

export interface ReferralSummary {
  code: string
  shareUrl: string
  creditBalance: number
  pendingReferrals: number
  creditedReferrals: number
  referrals: Array<{
    id: string
    status: 'pending' | 'credited'
    referredName: string
    createdAt: string
    creditedAt: string | null
  }>
}

export async function getReferralSummary(userId: string): Promise<ReferralSummary> {
  const code = await ensureReferralCode(userId)
  const customerAppUrl = process.env.CUSTOMER_APP_URL || 'http://localhost:5173'

  const [balanceRow] = await db
    .select({
      total: sql<string>`coalesce(sum(${customerCredits.remainingAmount})::numeric, 0)`,
    })
    .from(customerCredits)
    .where(and(eq(customerCredits.userId, userId), gt(customerCredits.remainingAmount, '0')))

  const rows = await db
    .select({
      id: referrals.id,
      status: referrals.status,
      createdAt: referrals.createdAt,
      creditedAt: referrals.creditedAt,
      referredName: profiles.name,
    })
    .from(referrals)
    .innerJoin(profiles, eq(profiles.id, referrals.referredUserId))
    .where(eq(referrals.referrerUserId, userId))

  const pendingReferrals = rows.filter((r) => r.status === 'pending').length
  const creditedReferrals = rows.filter((r) => r.status === 'credited').length

  return {
    code,
    shareUrl: `${customerAppUrl}/signup?ref=${encodeURIComponent(code)}`,
    creditBalance: Number(balanceRow?.total ?? 0),
    pendingReferrals,
    creditedReferrals,
    referrals: rows.map((r) => ({
      id: r.id,
      status: r.status as 'pending' | 'credited',
      referredName: r.referredName,
      createdAt: r.createdAt.toISOString(),
      creditedAt: r.creditedAt?.toISOString() ?? null,
    })),
  }
}

async function countPaidCustomerInvoices(
  tx: DbOrTx,
  customerId: string
): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(and(eq(invoices.ownerId, customerId), eq(invoices.ownerType, 'customer'), eq(invoices.status, 'paid')))
  return row?.count ?? 0
}

async function insertReferralCredit(
  tx: DbOrTx,
  params: {
    userId: string
    referralId: string
    source: 'referral_referrer' | 'referral_referred'
    amount: number
  }
): Promise<boolean> {
  try {
    await tx.insert(customerCredits).values({
      userId: params.userId,
      amount: String(params.amount),
      remainingAmount: String(params.amount),
      source: params.source,
      referralId: params.referralId,
    })
    return true
  } catch (err) {
    if ((err as { code?: string }).code === '23505') return false
    throw err
  }
}

/**
 * When a referred customer pays their first subscription invoice, grant store
 * credit to both parties. Idempotent — safe on webhook retries.
 */
export async function maybeGrantReferralCreditsOnFirstPayment(
  tx: DbOrTx,
  params: { customerId: string; invoiceId: string }
): Promise<boolean> {
  const paidCount = await countPaidCustomerInvoices(tx, params.customerId)
  if (paidCount !== 1) return false

  const [referral] = await tx
    .select()
    .from(referrals)
    .where(and(eq(referrals.referredUserId, params.customerId), eq(referrals.status, 'pending')))
    .for('update')
    .limit(1)
  if (!referral) return false

  const amount = referralCreditAmount()
  const [updated] = await tx
    .update(referrals)
    .set({
      status: 'credited',
      firstPaidInvoiceId: params.invoiceId,
      creditedAt: new Date(),
    })
    .where(and(eq(referrals.id, referral.id), eq(referrals.status, 'pending')))
    .returning({ id: referrals.id })
  if (!updated) return false

  await insertReferralCredit(tx, {
    userId: referral.referrerUserId,
    referralId: referral.id,
    source: 'referral_referrer',
    amount,
  })
  await insertReferralCredit(tx, {
    userId: referral.referredUserId,
    referralId: referral.id,
    source: 'referral_referred',
    amount,
  })

  await logAuditSafe({
    actorId: params.customerId,
    actorRole: 'customer',
    action: 'referral.credits_granted',
    entityType: 'referral',
    entityId: referral.id,
    after: { invoiceId: params.invoiceId, amount },
  })

  return true
}

/** Source tag for the compensating credit written when an invoice is voided. */
export const CREDIT_SOURCE_VOID_RESTORE = 'invoice_void_restore'

/**
 * Gives back store credit that an invoice consumed at generation time, when
 * that invoice is voided (subscription returned/cancelled/force-completed, or
 * an admin void). Credit was previously destroyed with no ledger entry.
 *
 * Writes a NEW `customer_credits` row rather than mutating the original grants
 * — the table is an append-only ledger — and zeroes the invoice's
 * `creditApplied` so a second void of the same invoice cannot mint credit
 * twice. The invoice id is recorded on the credit's `source` and in the audit
 * log. Returns the amount restored (0 when there was nothing to restore).
 */
export async function restoreStoreCreditForVoidedInvoice(
  tx: DbOrTx,
  params: { invoiceId: string }
): Promise<number> {
  const [invoice] = await tx
    .select()
    .from(invoices)
    .where(eq(invoices.id, params.invoiceId))
    .limit(1)
  if (!invoice || invoice.ownerType !== 'customer') return 0
  const applied = Number(invoice.creditApplied ?? 0)
  if (!Number.isFinite(applied) || applied <= 0) return 0

  await tx.insert(customerCredits).values({
    userId: invoice.ownerId,
    amount: String(applied),
    remainingAmount: String(applied),
    source: `${CREDIT_SOURCE_VOID_RESTORE}:${invoice.id}`,
  })
  await tx.update(invoices).set({ creditApplied: '0' }).where(eq(invoices.id, invoice.id))
  await logAuditSafe({
    action: 'billing.credit.restored',
    entityType: 'invoice',
    entityId: invoice.id,
    after: { userId: invoice.ownerId, restoredAmount: applied },
  })
  return applied
}

/** Applies available store credit to a new invoice subtotal (FIFO). */
export async function applyStoreCreditToInvoice(
  tx: DbOrTx,
  params: { customerId: string; invoiceId: string; subtotal: number }
): Promise<{ subtotal: number; creditApplied: number; fullyCovered: boolean }> {
  if (params.subtotal <= 0) {
    return { subtotal: params.subtotal, creditApplied: 0, fullyCovered: false }
  }

  const credits = await tx
    .select()
    .from(customerCredits)
    .where(and(eq(customerCredits.userId, params.customerId), gt(customerCredits.remainingAmount, '0')))
    .orderBy(customerCredits.createdAt)
    .for('update')

  let remaining = params.subtotal
  let creditApplied = 0

  for (const credit of credits) {
    if (remaining <= 0) break
    const available = Number(credit.remainingAmount)
    if (available <= 0) continue
    const use = Math.min(available, remaining)
    remaining = Math.round((remaining - use) * 100) / 100
    creditApplied = Math.round((creditApplied + use) * 100) / 100
    await tx
      .update(customerCredits)
      .set({ remainingAmount: String(Math.round((available - use) * 100) / 100) })
      .where(eq(customerCredits.id, credit.id))
  }

  // Credit that covers the whole subtotal settles the invoice. It used to be
  // clamped to a 0.01 residue and left `due`, which then went overdue and
  // dropped the subscription to past_due over one fils nobody owed.
  const fullyCovered = remaining <= 0
  const payable = fullyCovered ? 0 : remaining

  if (creditApplied > 0) {
    await tx
      .update(invoices)
      .set({
        creditApplied: String(creditApplied),
        amount: String(payable),
        subtotal: String(payable),
        ...(fullyCovered ? { status: 'paid' as const } : {}),
      })
      .where(eq(invoices.id, params.invoiceId))
    if (fullyCovered) {
      await logAuditSafe({
        action: 'billing.invoice.settled_by_credit',
        entityType: 'invoice',
        entityId: params.invoiceId,
        after: { userId: params.customerId, creditApplied },
      })
    }
  }

  return { subtotal: payable, creditApplied, fullyCovered }
}

export async function getCustomerCreditBalance(userId: string): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${customerCredits.remainingAmount})::numeric, 0)`,
    })
    .from(customerCredits)
    .where(and(eq(customerCredits.userId, userId), gt(customerCredits.remainingAmount, '0')))
  return Number(row?.total ?? 0)
}
