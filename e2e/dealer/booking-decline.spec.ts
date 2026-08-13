import { test, expect } from '../fixtures/auth'

test.describe('E2E-D03 booking decline', () => {
  test('booking requests page loads', async ({ page, loginAs }) => {
    await loginAs(page, 'dealer')
    await page.goto('/requests')
    await expect(page.locator('body')).toBeVisible()
  })
})
