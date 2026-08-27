import { and, eq } from 'drizzle-orm'
import type { BillingCapabilities } from '@carflow/shared/types'
import { db } from '../db/index.js'
import { paymentMethods } from '../db/schema.js'
import { logAuditSafe } from './audit.js'
import {
  getSkipCashCardDetails,
  isSkipCashSavedCardsChargeReady,
  isSkipCashSavedCardsEnabled,
  SKIPCASH_SAVED_CARD_CAPABILITY,
  SkipCashSavedCardNotImplementedError,
  createSkipCashPaymentWithToken,
} from './skipcash.js'
import { issueInvoiceSkipCashIntent, SkipCashIntentError } from './skipCashIntents.js'

export function billingCapabilities(): BillingCapabilities {
  return {
    skipcashSavedCardsEnabled: isSkipCashSavedCardsEnabled(),
    skipcashSavedCardsChargeReady: isSkipCashSavedCardsChargeReady(),
    capabilityRequired: SKIPCASH_SAVED_CARD_CAPABILITY,
  }
}

function skipCashBrandLabel(brand: string): string {
  if (brand === 'Visa' || brand === 'Mastercard') return brand
  return 'Card'
}

/**
 * Persists a SkipCash token after a successful payment webhook.
 * Stores only the provider token id and masked metadata — never PAN.
 */
export async function persistSkipCashTokenForCustomer(params: {
  userId: string
  tokenId: string
  paymentId: string
}): Promise<void> {
  if (!isSkipCashSavedCardsEnabled()) return

  const details = await getSkipCashCardDetails(params.tokenId)
  const brand = details ? skipCashBrandLabel(details.brand) : 'Card'
  const last4 = details?.last4 ?? '0000'
  const expiryMonth = details?.expiryMonth ?? 12
  const expiryYear = details?.expiryYear ?? new Date().getFullYear() + 3

  const [existing] = await db
    .select()
    .from(paymentMethods)
    .where(
      and(
        eq(paymentMethods.userId, params.userId),
        eq(paymentMethods.provider, 'skipcash'),
        eq(paymentMethods.providerTokenId, params.tokenId)
      )
    )
    .limit(1)

  if (existing) {
    await db
      .update(paymentMethods)
      .set({
        brand,
        last4,
        expiryMonth,
        expiryYear,
        tokenSavedAt: new Date(),
      })
      .where(eq(paymentMethods.id, existing.id))
    return
  }

  const all = await db
    .select({ id: paymentMethods.id })
    .from(paymentMethods)
    .where(eq(paymentMethods.userId, params.userId))
  const isFirst = all.length === 0

  await db.insert(paymentMethods).values({
    userId: params.userId,
    brand,
    last4,
    expiryMonth,
    expiryYear,
    methodType: 'card',
    provider: 'skipcash',
    providerTokenId: params.tokenId,
    tokenSavedAt: new Date(),
    isDefault: isFirst,
  })

  await logAuditSafe({
    actorId: params.userId,
    actorRole: 'customer',
    action: 'billing.payment_method.token_saved',
    entityType: 'payment',
    entityId: params.paymentId,
    after: { provider: 'skipcash', last4 },
  })
}

export interface SavedCardInvoiceIntentResult {
  paymentId: string
  payUrl: string
  savedCardAttempted: boolean
  savedCardUsed: boolean
  message?: string
}

/**
 * Attempts a tokenized invoice payment; falls back to standard hosted redirect
 * when the charge stub is not ready.
 */
export async function issueInvoiceSkipCashIntentWithSavedCard(
  userId: string,
  invoiceId: string,
  paymentMethodId: string
): Promise<SavedCardInvoiceIntentResult> {
  if (!isSkipCashSavedCardsEnabled()) {
    throw new SkipCashIntentError(404, 'Saved-card payments are not enabled')
  }

  const [method] = await db
    .select()
    .from(paymentMethods)
    .where(and(eq(paymentMethods.id, paymentMethodId), eq(paymentMethods.userId, userId)))
    .limit(1)
  if (!method) {
    throw new SkipCashIntentError(404, 'Payment method not found')
  }
  if (method.provider !== 'skipcash' || !method.providerTokenId) {
    throw new SkipCashIntentError(
      400,
      'This payment method has no saved SkipCash token. Pay via hosted checkout instead.'
    )
  }

  if (!isSkipCashSavedCardsChargeReady()) {
    const fallback = await issueInvoiceSkipCashIntent(userId, invoiceId)
    return {
      ...fallback,
      savedCardAttempted: true,
      savedCardUsed: false,
      message:
        'Saved-card charge is not wired yet — redirecting to SkipCash hosted checkout (standard flow).',
    }
  }

  // TODO: When charge is wired, duplicate issueInvoiceSkipCashIntent setup then call
  // createSkipCashPaymentWithToken({ ...contact, tokenId: method.providerTokenId }).
  try {
    await createSkipCashPaymentWithToken({
      amount: 0,
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      transactionId: '',
      returnUrl: '',
      webhookUrl: '',
      tokenId: method.providerTokenId,
    })
    throw new SkipCashSavedCardNotImplementedError()
  } catch (err) {
    if (err instanceof SkipCashSavedCardNotImplementedError) {
      const fallback = await issueInvoiceSkipCashIntent(userId, invoiceId)
      return {
        ...fallback,
        savedCardAttempted: true,
        savedCardUsed: false,
        message: err.message,
      }
    }
    throw err
  }
}
