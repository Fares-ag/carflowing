import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'

const SANDBOX_BASE_URL = 'https://skipcashtest.azurewebsites.net/api/v1'
const PRODUCTION_BASE_URL = 'https://api.skipcash.app/api/v1'

function baseUrl(): string {
  return process.env.SKIPCASH_MODE === 'production' ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL
}

/**
 * SkipCash authenticates payment-creation requests via an Authorization header
 * containing base64(HMAC-SHA256(secret, combined)), where `combined` is the
 * non-empty request fields joined as `Key=Value` pairs in this exact order.
 * See https://dev.skipcash.app/doc/authentication/.
 */
const PAYMENT_SIGNATURE_FIELDS = [
  'Uid',
  'KeyId',
  'Amount',
  'FirstName',
  'LastName',
  'Phone',
  'Email',
  'Street',
  'City',
  'State',
  'Country',
  'PostalCode',
  'TransactionId',
  'Custom1',
] as const

function signFields(fields: Record<string, string | undefined>, order: readonly string[], secret: string): string {
  const combined = order
    .filter((key) => fields[key] !== undefined && fields[key] !== '')
    .map((key) => `${key}=${fields[key]}`)
    .join(',')
  return createHmac('sha256', secret).update(combined).digest('base64')
}

export interface CreateSkipCashPaymentParams {
  amount: number
  firstName: string
  lastName: string
  phone: string
  email: string
  transactionId: string
  returnUrl: string
  webhookUrl: string
}

export interface SkipCashPaymentResult {
  id: string
  payUrl: string
  statusId: number
}

export class SkipCashConfigError extends Error {}

function requireConfig(): { keyId: string; keySecret: string; clientId?: string } {
  const keyId = process.env.SKIPCASH_KEY_ID
  const keySecret = process.env.SKIPCASH_KEY_SECRET
  if (!keyId || !keySecret) {
    throw new SkipCashConfigError('SkipCash is not configured (missing SKIPCASH_KEY_ID/SKIPCASH_KEY_SECRET)')
  }
  return { keyId, keySecret, clientId: process.env.SKIPCASH_CLIENT_ID }
}

export async function createSkipCashPayment(
  params: CreateSkipCashPaymentParams
): Promise<SkipCashPaymentResult> {
  const { keyId, keySecret, clientId } = requireConfig()

  const body: Record<string, string> = {
    Uid: randomUUID(),
    KeyId: keyId,
    Amount: params.amount.toFixed(2),
    FirstName: params.firstName,
    LastName: params.lastName,
    Phone: params.phone,
    Email: params.email,
    TransactionId: params.transactionId,
    ReturnUrl: params.returnUrl,
    WebhookUrl: params.webhookUrl,
  }
  const authorization = signFields(body, PAYMENT_SIGNATURE_FIELDS, keySecret)

  const res = await fetch(`${baseUrl()}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authorization,
      ...(clientId ? { 'x-client-id': clientId } : {}),
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json().catch(() => ({}))) as {
    resultObj?: { id: string; payUrl: string; statusId: number }
    hasError?: boolean
    errorMessage?: string
  }

  if (!res.ok || json.hasError || !json.resultObj) {
    throw new Error(json.errorMessage || `SkipCash payment creation failed (HTTP ${res.status})`)
  }

  return { id: json.resultObj.id, payUrl: json.resultObj.payUrl, statusId: json.resultObj.statusId }
}

/** SkipCash transaction status codes, per the Webhooks documentation. */
export const SkipCashStatus = {
  NEW: 0,
  PENDING: 1,
  PAID: 2,
  CANCELED: 3,
  FAILED: 4,
  REJECTED: 5,
  REFUNDED: 6,
  PENDING_REFUND: 7,
  REFUND_FAILED: 8,
} as const

const WEBHOOK_SIGNATURE_FIELDS = ['PaymentId', 'Amount', 'StatusId', 'TransactionId', 'Custom1', 'VisaId'] as const

export interface SkipCashWebhookPayload {
  PaymentId: string
  Amount: string
  StatusId: number
  TransactionId?: string | null
  Custom1?: string | null
  VisaId?: string | null
}

/** Verifies the webhook `Authorization` header using the webhook key (a separate secret from the payment-creation key). */
export function verifySkipCashWebhookSignature(
  payload: SkipCashWebhookPayload,
  signature: string | undefined
): boolean {
  const webhookKey = process.env.SKIPCASH_WEBHOOK_KEY
  if (!webhookKey || !signature) return false

  const fields: Record<string, string> = {
    PaymentId: payload.PaymentId,
    Amount: payload.Amount,
    StatusId: String(payload.StatusId),
  }
  if (payload.TransactionId) fields.TransactionId = payload.TransactionId
  if (payload.Custom1) fields.Custom1 = payload.Custom1
  if (payload.VisaId) fields.VisaId = payload.VisaId

  const expected = signFields(fields, WEBHOOK_SIGNATURE_FIELDS, webhookKey)
  const expectedBuf = Buffer.from(expected)
  const actualBuf = Buffer.from(signature)
  return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf)
}

export interface SkipCashRefundResult {
  refunded: boolean
  manual: boolean
  message?: string
}

/** Attempts a SkipCash refund when configured; otherwise returns manual ops guidance. */
export async function requestSkipCashRefund(params: {
  externalPaymentId: string
  amount: number
}): Promise<SkipCashRefundResult> {
  if (process.env.SKIPCASH_REFUND_ENABLED !== 'true') {
    return {
      refunded: false,
      manual: true,
      message: 'Process refund manually in the SkipCash dashboard, then mark refunded in admin.',
    }
  }
  try {
    const { keyId, keySecret } = requireConfig()
    const body = {
      PaymentId: params.externalPaymentId,
      Amount: params.amount.toFixed(2),
    }
    const authorization = signFields(body, ['PaymentId', 'Amount'], keySecret)
    const res = await fetch(`${baseUrl()}/payments/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        KeyId: keyId,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { errorMessage?: string }
      return {
        refunded: false,
        manual: true,
        message: json.errorMessage || `SkipCash refund failed (HTTP ${res.status})`,
      }
    }
    return { refunded: true, manual: false }
  } catch (err) {
    return {
      refunded: false,
      manual: true,
      message: err instanceof Error ? err.message : 'SkipCash refund failed',
    }
  }
}
