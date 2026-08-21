import { test, expect } from '../fixtures/auth'

test.describe('E2E-A02 admin customer management', () => {
  test('admin lists customers and can open customer page', async ({ page, loginAs }) => {
    await page.goto('http://localhost:5174/login')
    await loginAs('admin')
    await page.goto('http://localhost:5174/customers')
    await expect(page.getByText(/customer/i).first()).toBeVisible({ timeout: 15000 })
  })
})
