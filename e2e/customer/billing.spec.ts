import { test, expect } from '../fixtures/auth'

test.describe('E2E-C07 billing', () => {
  test('billing redirect shows subscription and invoice sections', async ({ page, loginAs }) => {
    await loginAs('customer')
    await page.goto('/billing')
    await expect(page).toHaveURL(/\/settings\?section=billing/)

    await expect(page.getByRole('heading', { name: /^Billing$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Overview$/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /^Invoices$/i })).toBeVisible()
    await expect(page.getByText(/Payment methods/i).first()).toBeVisible()
  })
})
