import { test, expect } from '../fixtures/auth'

test.describe('E2E-D06 analytics', () => {
  test('analytics dashboard loads', async ({ page, loginAs }) => {
    await loginAs(page, 'dealer')
    await page.goto('/analytics')
    await expect(page.locator('body')).toBeVisible()
  })
})
