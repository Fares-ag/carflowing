import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { fetchWithTimeout } from '../utils/http.js'

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

  const res = await fetchWithTimeout(`${baseUrl()}/payments`, {
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
  /** Returned when the customer checked Save Card on the hosted page. */
  TokenId?: string | null
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

export interface SkipCashPaymentLookup {
  statusId: number
  amount?: string
}

/**
 * Queries a payment's current status at SkipCash (GET /payments/{id}) — used
 * by the reconciliation job when a webhook never arrived. Returns null when
 * the lookup cannot be performed (missing config / provider error) so callers
 * fail safe and retry on the next sweep.
 */
export async function getSkipCashPayment(externalId: string): Promise<SkipCashPaymentLookup | null> {
  try {
    const { keyId, keySecret, clientId } = requireConfig()
    const authorization = signFields({ PaymentId: externalId }, ['PaymentId'], keySecret)
    const res = await fetchWithTimeout(`${baseUrl()}/payments/${encodeURIComponent(externalId)}`, {
      method: 'GET',
      headers: {
        Authorization: authorization,
        KeyId: keyId,
        ...(clientId ? { 'x-client-id': clientId } : {}),
      },
    })
    if (!res.ok) {
      console.error(`SkipCash payment lookup failed (HTTP ${res.status}) for ${externalId}`)
      return null
    }
    const json = (await res.json().catch(() => ({}))) as {
      resultObj?: { statusId?: number; status?: number; amount?: string }
      hasError?: boolean
    }
    if (json.hasError || !json.resultObj) return null
    const statusId = json.resultObj.statusId ?? json.resultObj.status
    if (typeof statusId !== 'number') return null
    return { statusId, amount: json.resultObj.amount }
  } catch (err) {
    console.error('SkipCash payment lookup error', err)
    return null
  }
}

export interface SkipCashRefundResult {
  refunded: boolean
  manual: boolean
  message?: string
  /** SkipCash's id for the refund transaction, when the response carries one. */
  providerRefundId?: string
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
    const res = await fetchWithTimeout(`${baseUrl()}/payments/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        KeyId: keyId,
      },
      body: JSON.stringify(body),
    })
    // SkipCash reports business-rule rejections INSIDE a 200 via `hasError`,
    // exactly like createSkipCashPayment / getSkipCashPayment. Trusting res.ok
    // alone recorded a REJECTED refund as money returned to the customer.
    const json = (await res.json().catch(() => ({}))) as {
      resultObj?: { id?: string; statusId?: number; status?: number }
      hasError?: boolean
      errorMessage?: string
    }
    if (!res.ok || json.hasError || !json.resultObj) {
      return {
        refunded: false,
        manual: true,
        message: json.errorMessage || `SkipCash refund failed (HTTP ${res.status})`,
      }
    }
    const statusId = json.resultObj.statusId ?? json.resultObj.status
    // PENDING_REFUND is an accepted refund still settling — treating it as a
    // failure would send ops to refund a second time by hand. Only an explicit
    // REFUND_FAILED means the money did not move.
    if (statusId === SkipCashStatus.REFUND_FAILED) {
      return {
        refunded: false,
        manual: true,
        message:
          json.errorMessage ||
          'SkipCash reported REFUND_FAILED. Process the refund manually in the SkipCash dashboard.',
      }
    }
    return {
      refunded: true,
      manual: false,
      ...(json.resultObj.id ? { providerRefundId: json.resultObj.id } : {}),
    }
  } catch (err) {
    return {
      refunded: false,
      manual: true,
      message: err instanceof Error ? err.message : 'SkipCash refund failed',
    }
  }
}

/**
 * SkipCash supports card tokenization at the provider (see
 * https://dev.skipcash.app/doc/tokenization/) but this integration only
 * implements hosted redirect checkout today.
 */
export const SKIPCASH_SAVED_CARD_CAPABILITY =
  'SkipCash Tokenization: customer saves card on first hosted payment (Save Card checkbox); ' +
  'capture TokenId from webhook or GET /api/v1/payments/{id}; charge renewals via POST /api/v1/payments ' +
  'with TokenId in the request body (excluded from HMAC signature); optional GET /token/cardDetails/{id} ' +
  'for masked brand/last4/expiry. Merchant account must have tokenization enabled by SkipCash.'

/** Capability flag — default off until token charge is wired and verified. */
export function isSkipCashSavedCardsEnabled(): boolean {
  return process.env.SKIPCASH_SAVED_CARDS_ENABLED === 'true'
}

/** Set true once createSkipCashPaymentWithToken is implemented and tested. */
export function isSkipCashSavedCardsChargeReady(): boolean {
  return process.env.SKIPCASH_SAVED_CARDS_CHARGE_READY === 'true'
}

export class SkipCashSavedCardNotImplementedError extends Error {
  constructor() {
    super(`Saved-card charge is not wired in skipcash.ts. ${SKIPCASH_SAVED_CARD_CAPABILITY}`)
    this.name = 'SkipCashSavedCardNotImplementedError'
  }
}

export interface SkipCashCardDetails {
  last4: string
  brand: 'Visa' | 'Mastercard' | 'Unknown'
  expiryMonth: number
  expiryYear: number
}

export interface CreateSkipCashPaymentWithTokenParams extends CreateSkipCashPaymentParams {
  tokenId: string
}

/**
 * TODO: Wire SkipCash token payment — POST /api/v1/payments with TokenId in body
 * (TokenId must NOT be included in the HMAC Authorization signature).
 * Response still includes payUrl; customer completes OTP on the hosted page.
 */
export async function createSkipCashPaymentWithToken(
  _params: CreateSkipCashPaymentWithTokenParams
): Promise<SkipCashPaymentResult> {
  if (!isSkipCashSavedCardsChargeReady()) {
    throw new SkipCashSavedCardNotImplementedError()
  }
  // When SKIPCASH_SAVED_CARDS_CHARGE_READY=true, implement:
  // const body = { ...standard fields, TokenId: params.tokenId }
  // POST ${baseUrl()}/payments with Authorization from PAYMENT_SIGNATURE_FIELDS only
  throw new SkipCashSavedCardNotImplementedError()
}

/** Fetches masked card metadata for a SkipCash token (no PAN). */
export async function getSkipCashCardDetails(tokenId: string): Promise<SkipCashCardDetails | null> {
  try {
    const { keyId, keySecret, clientId } = requireConfig()
    const authorization = signFields({ TokenId: tokenId }, ['TokenId'], keySecret)
    const res = await fetchWithTimeout(
      `${baseUrl()}/token/cardDetails/${encodeURIComponent(tokenId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: authorization,
          KeyId: keyId,
          ...(clientId ? { 'x-client-id': clientId } : {}),
        },
      }
    )
    if (!res.ok) return null
    const json = (await res.json().catch(() => ({}))) as {
      resultObj?: Array<{ cardNumber?: string; cardType?: number; cardExpiry?: string }>
      hasError?: boolean
    }
    if (json.hasError || !json.resultObj?.[0]) return null
    const card = json.resultObj[0]
    const last4 = String(card.cardNumber ?? '').replace(/\D/g, '').slice(-4)
    if (!last4) return null
    const brand =
      card.cardType === 1 ? 'Visa' : card.cardType === 2 ? 'Mastercard' : 'Unknown'
    const [mm, yyyy] = String(card.cardExpiry ?? '').split('/')
    const expiryMonth = Number(mm)
    const expiryYear = Number(yyyy)
    if (!expiryMonth || !expiryYear) return null
    return { last4, brand, expiryMonth, expiryYear }
  } catch (err) {
    console.error('SkipCash card details lookup error', err)
    return null
  }
}
