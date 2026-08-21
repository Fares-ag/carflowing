import { test, expect } from '../fixtures/auth'

test.describe('E2E-D06 analytics', () => {
  test('analytics dashboard shows revenue metrics', async ({ page, loginAs }) => {
    await loginAs('dealer')
    await page.goto('/analytics')

    await expect(page.getByRole('heading', { name: /Advanced Analytics/i })).toBeVisible()
    await expect(page.getByText(/Total Revenue/i).first()).toBeVisible()
    await expect(page.getByText(/Active Bookings/i).first()).toBeVisible()
  })
})
