import { createHmac } from 'node:crypto'

const WEBHOOK_FIELDS = ['PaymentId', 'Amount', 'StatusId', 'TransactionId', 'Custom1', 'VisaId'] as const

export type SkipCashWebhookPayload = {
  PaymentId: string
  Amount: string
  StatusId: number
  TransactionId: string
  Custom1?: string
  VisaId?: string
}

/** HMAC signature matching apps/backend SkipCash webhook verification. */
export function signSkipCashWebhook(
  payload: SkipCashWebhookPayload,
  webhookKey: string
): string {
  const combined = WEBHOOK_FIELDS.filter(
    (key) => (payload as Record<string, unknown>)[key] !== undefined
  )
    .map((key) => `${key}=${(payload as Record<string, unknown>)[key]}`)
    .join(',')
  return createHmac('sha256', webhookKey).update(combined).digest('base64')
}

/** SkipCash StatusId for a successful payment. */
export const SKIPCASH_PAID = 2
