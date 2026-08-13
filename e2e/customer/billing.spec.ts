import { test, expect } from '../fixtures/auth'

test.describe('E2E-C07 billing', () => {
  test('billing page loads', async ({ page, loginAs }) => {
    await loginAs(page, 'customer')
    await page.goto('/billing')
    await expect(page.locator('body')).toBeVisible()
  })
})
