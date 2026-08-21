import { and, eq, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { promoCodes, promoRedemptions } from '../db/schema.js'
import { todayISO } from '../utils/dates.js'
import type { DbOrTx } from './audit.js'

export interface PromoValidationResult {
  valid: boolean
  error?: string
  promoCodeId?: string
  code?: string
  discountType?: 'percent' | 'fixed'
  discountValue?: number
  discountAmount?: number
  listMonthlyAmount?: number
  firstInvoiceOnly?: boolean
}

export class PromoRedeemError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PromoRedeemError'
  }
}

async function customerRedemptionCount(
  executor: typeof db | DbOrTx,
  promoCodeId: string,
  customerId: string
): Promise<number> {
  const [row] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(promoRedemptions)
    .where(
      and(eq(promoRedemptions.promoCodeId, promoCodeId), eq(promoRedemptions.customerId, customerId))
    )
  return row?.count ?? 0
}

export async function validatePromoCode(input: {
  code: string
  customerId: string
  termMonths: number
  subtotal: number
}): Promise<PromoValidationResult> {
  const normalized = input.code.trim().toUpperCase()
  if (!normalized) {
    return { valid: false, error: 'Promo code is required' }
  }
  const [row] = await db.select().from(promoCodes).where(eq(promoCodes.code, normalized)).limit(1)
  if (!row || !row.active) {
    return { valid: false, error: 'Invalid or inactive promo code' }
  }
  const today = todayISO()
  if (row.validFrom && String(row.validFrom) > today) {
    return { valid: false, error: 'Promo code is not active yet' }
  }
  if (row.validUntil && String(row.validUntil) < today) {
    return { valid: false, error: 'Promo code has expired' }
  }
  if (input.termMonths < row.minTermMonths) {
    return {
      valid: false,
      error: `Promo requires a minimum term of ${row.minTermMonths} month(s)`,
    }
  }
  if (row.maxUses != null && row.usedCount >= row.maxUses) {
    return { valid: false, error: 'Promo code has reached its usage limit' }
  }
  const perCustomerLimit = row.perCustomerLimit ?? 1
  const customerUses = await customerRedemptionCount(db, row.id, input.customerId)
  if (customerUses >= perCustomerLimit) {
    return { valid: false, error: 'You have already used this promo code' }
  }
  const discountType = row.discountType as 'percent' | 'fixed'
  const discountValue = Number(row.discountValue)
  const firstInvoiceOnly = row.firstInvoiceOnly ?? true
  const basis = firstInvoiceOnly ? input.subtotal : input.subtotal * input.termMonths
  let discountAmount =
    discountType === 'percent'
      ? Math.round((basis * discountValue) / 100 * 100) / 100
      : discountValue
  discountAmount = Math.min(discountAmount, basis)
  if (discountAmount <= 0) {
    return { valid: false, error: 'Promo code does not apply to this order' }
  }
  return {
    valid: true,
    promoCodeId: row.id,
    code: row.code,
    discountType,
    discountValue,
    discountAmount,
    listMonthlyAmount: firstInvoiceOnly ? input.subtotal : undefined,
    firstInvoiceOnly,
  }
}

/**
 * Records a promo redemption inside the caller's transaction. Re-validates
 * maxUses and per-customer limits under row lock.
 */
export async function redeemPromoCode(
  tx: DbOrTx,
  input: {
    promoCodeId: string
    customerId: string
    discountAmount: number
    rentalId?: string
    bookingRequestId?: string
  }
): Promise<void> {
  const [promo] = await tx
    .select()
    .from(promoCodes)
    .where(eq(promoCodes.id, input.promoCodeId))
    .for('update')
    .limit(1)
  if (!promo || !promo.active) {
    throw new PromoRedeemError('Invalid or inactive promo code')
  }
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses) {
    throw new PromoRedeemError('Promo code has reached its usage limit')
  }
  const perCustomerLimit = promo.perCustomerLimit ?? 1
  const customerUses = await customerRedemptionCount(tx, input.promoCodeId, input.customerId)
  if (customerUses >= perCustomerLimit) {
    throw new PromoRedeemError('You have already used this promo code')
  }

  await tx.insert(promoRedemptions).values({
    promoCodeId: input.promoCodeId,
    customerId: input.customerId,
    discountAmount: String(input.discountAmount),
    rentalId: input.rentalId ?? null,
    bookingRequestId: input.bookingRequestId ?? null,
  })

  await tx
    .update(promoCodes)
    .set({ usedCount: sql`${promoCodes.usedCount} + 1` })
    .where(eq(promoCodes.id, input.promoCodeId))
}

export function mapPromoCode(row: typeof promoCodes.$inferSelect) {
  const remainingUses =
    row.maxUses != null ? Math.max(0, row.maxUses - row.usedCount) : null
  return {
    id: row.id,
    code: row.code,
    discountType: row.discountType as 'percent' | 'fixed',
    discountValue: Number(row.discountValue),
    minTermMonths: row.minTermMonths,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
    remainingUses,
    perCustomerLimit: row.perCustomerLimit ?? 1,
    firstInvoiceOnly: row.firstInvoiceOnly ?? true,
    validFrom: row.validFrom ? String(row.validFrom) : null,
    validUntil: row.validUntil ? String(row.validUntil) : null,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  }
}
