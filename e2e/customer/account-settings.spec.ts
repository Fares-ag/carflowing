import { test, expect } from '../fixtures/auth'

test.describe('E2E-C06 account settings', () => {
  test('settings page loads', async ({ page, loginAs }) => {
    await loginAs(page, 'customer')
    await page.goto('/settings')
    await expect(page.locator('body')).toBeVisible()
  })
})
