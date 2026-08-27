import { apiRequest } from '@carflow/shared'
import type { Payment } from '@carflow/shared/types'

export interface SkipCashPaymentIntent {
  paymentId: string
  payUrl: string
}

export interface SkipCashSavedCardInvoiceIntent extends SkipCashPaymentIntent {
  savedCardAttempted?: boolean
  savedCardUsed?: boolean
  message?: string
}

export type SkipCashPaymentStatus = Payment & {
  canRetry?: boolean
}

export interface CreateSkipCashIntentInput {
  vehicleId: string
  note?: string
  contact?: { firstName?: string; lastName?: string; phone?: string; email?: string }
}

export async function createSkipCashPaymentIntent(
  input: CreateSkipCashIntentInput
): Promise<SkipCashPaymentIntent> {
  return apiRequest('/payments/skipcash/create-intent', { method: 'POST', body: input })
}

export async function getSkipCashPaymentStatus(paymentId: string): Promise<SkipCashPaymentStatus> {
  return apiRequest(`/payments/skipcash/status/${paymentId}`)
}

export async function retrySkipCashPayment(paymentId: string): Promise<SkipCashPaymentIntent> {
  return apiRequest(`/payments/skipcash/retry/${paymentId}`, { method: 'POST' })
}

/**
 * Starts an online SkipCash payment for a monthly subscription invoice
 * (`due`/`overdue` renewals). Redirect the browser to `payUrl`, same as the
 * checkout create-intent flow.
 */
export async function createSkipCashInvoiceIntent(invoiceId: string): Promise<SkipCashPaymentIntent> {
  return apiRequest('/payments/skipcash/invoice-intent', { method: 'POST', body: { invoiceId } })
}

export async function createSkipCashInvoiceIntentWithSavedCard(
  invoiceId: string,
  paymentMethodId: string
): Promise<SkipCashSavedCardInvoiceIntent> {
  return apiRequest('/payments/skipcash/invoice-intent-saved-card', {
    method: 'POST',
    body: { invoiceId, paymentMethodId },
  })
}

