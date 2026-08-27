import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSkipCashPayment,
  requestSkipCashRefund,
  SkipCashConfigError,
  SkipCashStatus,
  verifySkipCashWebhookSignature,
} from '../skipcash.js'

const basePaymentParams = {
  amount: 199.5,
  firstName: 'Jane',
  lastName: 'Doe',
  phone: '+97455555555',
  email: 'jane@example.com',
  transactionId: 'tx-42',
  returnUrl: 'https://api.example.com/return',
  webhookUrl: 'https://api.example.com/webhook',
}

describe('createSkipCashPayment', () => {
  afterEach(() => {
    delete process.env.SKIPCASH_KEY_ID
    delete process.env.SKIPCASH_KEY_SECRET
    delete process.env.SKIPCASH_CLIENT_ID
    vi.unstubAllGlobals()
  })

  it('throws SkipCashConfigError when the key id/secret are missing', async () => {
    await expect(createSkipCashPayment(basePaymentParams)).rejects.toThrow(SkipCashConfigError)
  })

  it('signs the request and returns the pay URL from a successful response', async () => {
    process.env.SKIPCASH_KEY_ID = 'key-id'
    process.env.SKIPCASH_KEY_SECRET = 'key-secret'
    process.env.SKIPCASH_CLIENT_ID = 'client-id'

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        resultObj: { id: 'skipcash-id', payUrl: 'https://pay.example/x', statusId: 0 },
        hasError: false,
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await createSkipCashPayment(basePaymentParams)

    expect(result).toEqual({ id: 'skipcash-id', payUrl: 'https://pay.example/x', statusId: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://skipcashtest.azurewebsites.net/api/v1/payments')
    expect(init.headers['x-client-id']).toBe('client-id')
    expect(typeof init.headers.Authorization).toBe('string')
    expect(init.headers.Authorization.length).toBeGreaterThan(0)

    const body = JSON.parse(init.body)
    expect(body.Amount).toBe('199.50')
    expect(body.KeyId).toBe('key-id')
    expect(body.TransactionId).toBe('tx-42')
  })

  it('uses the production endpoint when SKIPCASH_MODE=production', async () => {
    process.env.SKIPCASH_KEY_ID = 'key-id'
    process.env.SKIPCASH_KEY_SECRET = 'key-secret'
    process.env.SKIPCASH_MODE = 'production'
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ resultObj: { id: 'x', payUrl: 'https://pay.example/y', statusId: 0 } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await createSkipCashPayment(basePaymentParams)

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.skipcash.app/api/v1/payments')
    delete process.env.SKIPCASH_MODE
  })

  it('throws with the gateway error message when SkipCash rejects the request', async () => {
    process.env.SKIPCASH_KEY_ID = 'key-id'
    process.env.SKIPCASH_KEY_SECRET = 'key-secret'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ hasError: true, errorMessage: 'Bad phone number' }),
      })
    )

    await expect(createSkipCashPayment(basePaymentParams)).rejects.toThrow('Bad phone number')
  })
})

describe('verifySkipCashWebhookSignature', () => {
  afterEach(() => {
    delete process.env.SKIPCASH_WEBHOOK_KEY
  })

  it('accepts a signature computed the same way SkipCash computes it', () => {
    process.env.SKIPCASH_WEBHOOK_KEY = 'webhook-secret'
    const payload = {
      PaymentId: 'pay-1',
      Amount: '10.00',
      StatusId: SkipCashStatus.PAID,
      TransactionId: 'tx-1',
      VisaId: 'visa-1',
    }
    const combined = `PaymentId=${payload.PaymentId},Amount=${payload.Amount},StatusId=${payload.StatusId},TransactionId=${payload.TransactionId},VisaId=${payload.VisaId}`
    const signature = createHmac('sha256', 'webhook-secret').update(combined).digest('base64')

    expect(verifySkipCashWebhookSignature(payload, signature)).toBe(true)
  })

  it('rejects a tampered or incorrect signature', () => {
    process.env.SKIPCASH_WEBHOOK_KEY = 'webhook-secret'
    const payload = { PaymentId: 'pay-1', Amount: '10.00', StatusId: SkipCashStatus.PAID }
    expect(verifySkipCashWebhookSignature(payload, 'not-the-real-signature')).toBe(false)
  })

  it('rejects when the webhook key is not configured', () => {
    delete process.env.SKIPCASH_WEBHOOK_KEY
    expect(verifySkipCashWebhookSignature({ PaymentId: 'x', Amount: '1', StatusId: 2 }, 'sig')).toBe(false)
  })
})

/**
 * SkipCash reports business-rule rejections inside a 200 (`hasError`), so a
 * bare `res.ok` recorded a REJECTED refund as money returned to the customer —
 * admin then marked the payment refunded and stopped chasing it.
 */
describe('requestSkipCashRefund', () => {
  const params = { externalPaymentId: 'skipcash-pay-1', amount: 250.5 }

  afterEach(() => {
    delete process.env.SKIPCASH_REFUND_ENABLED
    delete process.env.SKIPCASH_KEY_ID
    delete process.env.SKIPCASH_KEY_SECRET
    vi.unstubAllGlobals()
  })

  function enableRefunds() {
    process.env.SKIPCASH_REFUND_ENABLED = 'true'
    process.env.SKIPCASH_KEY_ID = 'key-id'
    process.env.SKIPCASH_KEY_SECRET = 'key-secret'
  }

  it('returns manual guidance when automatic refunds are not enabled', async () => {
    const result = await requestSkipCashRefund(params)
    expect(result.refunded).toBe(false)
    expect(result.manual).toBe(true)
  })

  it('does NOT report a refund for HTTP 200 + hasError:true', async () => {
    enableRefunds()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ hasError: true, errorMessage: 'Refund window has expired' }),
      })
    )

    const result = await requestSkipCashRefund(params)

    expect(result.refunded).toBe(false)
    expect(result.manual).toBe(true)
    expect(result.message).toBe('Refund window has expired')
  })

  it('does NOT report a refund for HTTP 200 with no resultObj', async () => {
    enableRefunds()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    )

    const result = await requestSkipCashRefund(params)

    expect(result.refunded).toBe(false)
    expect(result.manual).toBe(true)
    expect(result.message).toContain('HTTP 200')
  })

  it('does NOT report a refund when the provider status is REFUND_FAILED', async () => {
    enableRefunds()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          hasError: false,
          resultObj: { id: 'refund-9', statusId: SkipCashStatus.REFUND_FAILED },
        }),
      })
    )

    const result = await requestSkipCashRefund(params)

    expect(result.refunded).toBe(false)
    expect(result.manual).toBe(true)
    expect(result.message).toMatch(/REFUND_FAILED/)
  })

  it('reports a refund and its provider id on a clean success', async () => {
    enableRefunds()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          hasError: false,
          resultObj: { id: 'refund-42', statusId: SkipCashStatus.REFUNDED },
        }),
      })
    )

    const result = await requestSkipCashRefund(params)

    expect(result).toEqual({ refunded: true, manual: false, providerRefundId: 'refund-42' })
  })

  it('treats PENDING_REFUND as accepted so ops do not refund a second time', async () => {
    enableRefunds()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          hasError: false,
          resultObj: { id: 'refund-43', statusId: SkipCashStatus.PENDING_REFUND },
        }),
      })
    )

    const result = await requestSkipCashRefund(params)

    expect(result.refunded).toBe(true)
    expect(result.providerRefundId).toBe('refund-43')
  })

  it('surfaces the gateway message on a non-2xx response', async () => {
    enableRefunds()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ hasError: true, errorMessage: 'Payment already refunded' }),
      })
    )

    const result = await requestSkipCashRefund(params)

    expect(result.refunded).toBe(false)
    expect(result.message).toBe('Payment already refunded')
  })
})
