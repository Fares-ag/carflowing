import { test, expect, DEMO_ACCOUNTS } from '../fixtures/auth'
import { SKIPCASH_PAID, signSkipCashWebhook } from '../helpers/skipcash'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

const STAGING_ENABLED = process.env.E2E_SKIP_CASH_STAGING === '1'
const API_BASE = process.env.E2E_STAGING_API_URL ?? 'http://localhost:3001'
const CUSTOMER_BASE = process.env.E2E_STAGING_CUSTOMER_URL ?? 'http://localhost:5173'
const WEBHOOK_KEY = process.env.E2E_SKIP_CASH_WEBHOOK_KEY ?? process.env.SKIPCASH_WEBHOOK_KEY ?? ''

async function loginCustomer(page: import('@playwright/test').Page) {
  const { email, password } = DEMO_ACCOUNTS.customer
  await page.goto(`${CUSTOMER_BASE}/login`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /^Sign in$/i }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}

test.describe('E2E-X03 SkipCash checkout → webhook → booking', () => {
  test.skip(
    !STAGING_ENABLED || !WEBHOOK_KEY,
    'Set E2E_SKIP_CASH_STAGING=1 and E2E_SKIP_CASH_WEBHOOK_KEY (staging SKIPCASH_WEBHOOK_KEY) to run'
  )

  test('sandbox payment intent settles via webhook and shows booking', async ({ page }) => {
    await loginCustomer(page)

    for (const type of ['qid', 'drivers_license']) {
      const res = await page.request.post(`${API_BASE}/api/uploads/document`, {
        multipart: {
          type,
          file: { name: `${type}.png`, mimeType: 'image/png', buffer: PNG_1PX },
        },
      })
      expect(res.ok()).toBeTruthy()
    }

    await page.goto(`${CUSTOMER_BASE}/browse`)
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /^book$/i }).first().click()
    await page.waitForURL(/\/car\//)
    await page.getByRole('button', { name: /continue to checkout/i }).click()
    await page.waitForURL(/\/checkout/)

    await page.getByRole('textbox', { name: 'Last Name *' }).fill('Tester')
    await page.getByRole('textbox', { name: 'Phone Number *' }).fill('+97455512345')
    await page.getByLabel(/qatar id \(qid\) number/i).fill('28412345678')
    await page.getByLabel(/date of birth/i).fill('1990-01-15')
    await page.getByLabel(/license number/i).fill('DL-123456')
    await page.getByLabel(/license expiry|expiry date/i).fill('2030-01-15')
    await page.getByLabel(/street/i).fill('12 Corniche St')
    await page.getByLabel(/^city/i).fill('Doha')

    await page.getByLabel(/pay now with card/i).check()

    // SkipCash cannot reach localhost webhooks — this spec targets a deployed staging API.
    await page.route('**/*', async (route) => {
      const url = route.request().url()
      if (/skipcashtest|skipcash\.com|skipcash/i.test(url) && !url.includes('/api/')) {
        await route.abort()
        return
      }
      await route.continue()
    })

    const intentResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/payments/skipcash/create-intent') && res.status() === 201,
      { timeout: 30000 }
    )

    await page.getByRole('button', { name: /^continue$/i }).click()

    const intentRes = await intentResponse
    const { paymentId } = (await intentRes.json()) as { paymentId: string }
    expect(paymentId).toBeTruthy()

    const statusRes = await page.request.get(
      `${API_BASE}/api/payments/skipcash/status/${paymentId}`
    )
    expect(statusRes.ok()).toBeTruthy()
    const payment = (await statusRes.json()) as {
      amount: number
      externalTransactionId?: string
    }
    expect(payment.externalTransactionId).toBeTruthy()

    const webhookPayload = {
      PaymentId: payment.externalTransactionId!,
      Amount: Number(payment.amount).toFixed(2),
      StatusId: SKIPCASH_PAID,
      TransactionId: paymentId,
    }
    const signature = signSkipCashWebhook(webhookPayload, WEBHOOK_KEY)

    const webhookRes = await page.request.post(`${API_BASE}/skipcash-pay/callback`, {
      headers: { authorization: signature },
      data: webhookPayload,
    })
    expect(webhookRes.ok()).toBeTruthy()

    await page.goto(`${CUSTOMER_BASE}/payment-status?paymentId=${encodeURIComponent(paymentId)}`)
    await expect(page.getByRole('heading', { name: /Payment successful/i })).toBeVisible({
      timeout: 15000,
    })

    await page.goto(`${CUSTOMER_BASE}/my-booking`)
    await expect(page.getByText(/request sent|waiting for the dealer|pending/i).first()).toBeVisible({
      timeout: 15000,
    })
  })
})
