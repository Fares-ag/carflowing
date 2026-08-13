import { test, expect } from '../fixtures/auth'

test.describe('E2E-C04 favorites', () => {
  test('favorites page loads for customer', async ({ page, loginAs }) => {
    await loginAs(page, 'customer')
    await page.goto('/favorites')
    await expect(page.locator('body')).toBeVisible()
  })
})
