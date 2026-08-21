import { test, expect } from '../fixtures/auth'

test.describe('E2E-C notifications', () => {
  test('notifications page loads for signed-in customer', async ({ page, loginAs }) => {
    await loginAs('customer')
    await page.goto('/notifications')
    await expect(page.getByRole('heading', { name: /^Notifications$/i })).toBeVisible({ timeout: 15000 })
  })

  test('header shows notification bell when signed in', async ({ page, loginAs }) => {
    await loginAs('customer')
    await page.goto('/browse')
    await expect(page.getByRole('link', { name: /Notifications/i })).toBeVisible({ timeout: 15000 })
  })
})
