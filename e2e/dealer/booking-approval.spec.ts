import { test, expect } from '../fixtures/auth'

test.describe('E2E-D02 dealer booking approval', () => {
  test('dealer can open booking requests queue', async ({ page, loginAs }) => {
    await page.goto('http://localhost:5175/login')
    await loginAs('dealer')
    await page.goto('http://localhost:5175/requests')
    await expect(page.getByText(/booking|request|pending/i).first()).toBeVisible({ timeout: 15000 })
  })
})
