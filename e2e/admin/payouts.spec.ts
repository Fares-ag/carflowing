import { test, expect } from '../fixtures/auth'

const ADMIN_BASE = 'http://localhost:5174'

test.describe('E2E-A payouts', () => {
  test('payouts page loads for admin', async ({ page, loginAs }) => {
    await loginAs('admin')
    await page.goto(`${ADMIN_BASE}/payouts`)
    await expect(page.getByText(/Dealer settlement batches/i)).toBeVisible({ timeout: 15000 })
  })

  test('dealers detail exposes bank details section', async ({ page, loginAs }) => {
    await loginAs('admin')
    await page.goto(`${ADMIN_BASE}/dealers`)
    await expect(page.getByText(/Dealer Management/i)).toBeVisible({ timeout: 15000 })
    const viewBtn = page.getByTitle('View details').first()
    if (await viewBtn.isVisible()) {
      await viewBtn.click()
      await expect(page.getByText(/Payout bank details/i)).toBeVisible({ timeout: 10000 })
    }
  })
})
