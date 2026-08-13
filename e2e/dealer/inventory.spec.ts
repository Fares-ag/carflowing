import { test, expect } from '../fixtures/auth'

test.describe('E2E-D01 inventory', () => {
  test('inventory page loads', async ({ page, loginAs }) => {
    await loginAs(page, 'dealer')
    await page.goto('/inventory')
    await expect(page.locator('body')).toBeVisible()
  })
})
