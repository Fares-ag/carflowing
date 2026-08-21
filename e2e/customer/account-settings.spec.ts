import { test, expect } from '../fixtures/auth'

test.describe('E2E-C06 account settings', () => {
  test('settings page loads', async ({ page, loginAs }) => {
    await loginAs('customer')
    await page.goto('/settings')
    await expect(page.locator('body')).toBeVisible()
  })

  test('support section loads complaint history area', async ({ page, loginAs }) => {
    await loginAs('customer')
    await page.goto('/settings?section=support')
    await expect(page.getByRole('heading', { name: /^Support$/i })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/Your requests/i)).toBeVisible()
  })
})
