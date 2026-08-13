import { test, expect } from '../fixtures/auth'

test.describe('E2E-X02 role isolation', () => {
  test('customer cannot access dealer or admin apps', async ({ page, loginAs }) => {
    await loginAs(page, 'customer')
    for (const url of ['http://localhost:5175/inventory', 'http://localhost:5174/customers']) {
      await page.goto(url)
      await expect(page).toHaveURL(/login/)
    }
  })
})
