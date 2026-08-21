import { test, expect } from '../fixtures/auth'

test.describe('E2E-D04 leads CRM', () => {
  test('leads page shows CRM stats and add-lead action', async ({ page, loginAs }) => {
    await loginAs('dealer')
    await page.goto('/leads')

    await expect(page.getByRole('heading', { name: /Leads Management/i })).toBeVisible()
    await expect(page.getByText(/Track and convert customer inquiries/i)).toBeVisible()
    await expect(page.getByText(/New Leads/i).first()).toBeVisible()
    await expect(page.getByText(/Conversion Rate/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Add Lead/i })).toBeVisible()
  })
})
