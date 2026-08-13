import { test, expect } from '../fixtures/auth'

test.describe('E2E-D04 leads CRM', () => {
  test('leads page loads', async ({ page, loginAs }) => {
    await loginAs(page, 'dealer')
    await page.goto('/leads')
    await expect(page.locator('body')).toBeVisible()
  })
})
