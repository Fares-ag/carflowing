import { test, expect } from '../fixtures/auth'

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

test.describe('E2E-X01 full booking lifecycle', () => {
  test('customer books → dealer approves → customer sees rental', async ({ page, loginAs }) => {
    await loginAs('customer')

    // Identity documents are required at checkout; upload via the API with
    // the page's own session cookies.
    for (const type of ['qid', 'drivers_license']) {
      const res = await page.request.post('http://localhost:3001/api/uploads/document', {
        multipart: {
          type,
          file: { name: `${type}.png`, mimeType: 'image/png', buffer: PNG_1PX },
        },
      })
      expect(res.ok()).toBeTruthy()
    }

    await page.goto('/browse')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /^book$/i }).first().click()
    await page.waitForURL(/\/car\//)

    await page.getByRole('button', { name: /continue to checkout/i }).click()
    await page.waitForURL(/\/checkout/)

    // Personal + licence + address details (documents already on file).
    await page.getByRole('textbox', { name: 'Last Name *' }).fill('Tester')
    await page.getByRole('textbox', { name: 'Phone Number *' }).fill('+97455512345')
    await page.getByLabel(/date of birth/i).fill('1990-01-15')
    await page.getByLabel(/qatar id|qid/i).fill('28412345678')
    await page.getByLabel(/license number/i).fill('12345678')
    await page.getByLabel(/license expiry|expiry date/i).fill('2030-01-15')
    await page.getByLabel(/street/i).fill('12 Corniche St')
    await page.getByLabel(/^city/i).fill('Doha')
    // Billing country and delivery mode are both required by checkout validate().
    await page.getByLabel(/^country/i).selectOption('Qatar')
    await page.getByRole('radio', { name: /collect from dealer/i }).check()

    // Checkout now blocks on the Subscription Agreement / Terms consent box.
    await page.getByRole('checkbox', { name: /accept the/i }).check()
    await page.getByRole('button', { name: /^continue$/i }).click()

    await expect(page).toHaveURL(/\/my-booking/, { timeout: 15000 })
    await expect(page.getByText(/request sent|waiting for the dealer/i).first()).toBeVisible({
      timeout: 15000,
    })

    await page.goto('http://localhost:5175/login')
    await loginAs('dealer')
    await page.goto('http://localhost:5175/requests')
    const approve = page.getByRole('button', { name: /^approve$/i }).first()
    await expect(approve).toBeVisible({ timeout: 15000 })
    await approve.click()
    await page
      .getByRole('dialog', { name: /approve request/i })
      .getByRole('button', { name: /^approve$/i })
      .click()
    await expect(page.getByText(/approved/i).first()).toBeVisible({ timeout: 15000 })

    await page.goto('http://localhost:5173/login')
    await loginAs('customer')
    await page.goto('/my-booking')
    await expect(page.getByText(/approved|active rental/i).first()).toBeVisible({ timeout: 15000 })
  })
})
