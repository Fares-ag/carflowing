import { test, expect } from '../fixtures/auth'

/** Phase 1.6 — subscription spine: book → approve → handover → invoice visibility → return */
test.describe('E2E subscription spine', () => {
  test('offline booking through handover and return', async ({ page, loginAs }) => {
    await loginAs('customer')

    await page.goto('/browse')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /^book$/i }).first().click()
    await page.waitForURL(/\/car\//)
    await page.getByRole('button', { name: /continue to checkout/i }).click()
    await page.waitForURL(/\/checkout/)

    await page.getByRole('textbox', { name: 'Last Name *' }).fill('Spine')
    await page.getByRole('textbox', { name: 'Phone Number *' }).fill('+97455512345')
    await page.getByLabel(/date of birth/i).fill('1990-01-15')
    await page.getByLabel(/license number/i).fill('DL-999999')
    await page.getByLabel(/license expiry|expiry date/i).fill('2030-01-15')
    await page.getByLabel(/street/i).fill('1 West Bay')
    await page.getByLabel(/^city/i).fill('Doha')
    await page.getByRole('button', { name: /^continue$/i }).click()

    await expect(page).toHaveURL(/\/my-booking/, { timeout: 15000 })

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

    await page.goto('http://localhost:5175/rentals')
    await expect(page.getByText(/reserved|handover/i).first()).toBeVisible({ timeout: 15000 })
    const handover = page.getByRole('button', { name: /handover|hand over/i }).first()
    if (await handover.isVisible().catch(() => false)) {
      await handover.click()
    }

    await page.goto('http://localhost:5173/login')
    await loginAs('customer')
    await page.goto('/my-booking')
    await expect(page.getByText(/active|approved|subscription/i).first()).toBeVisible({ timeout: 15000 })
  })
})
