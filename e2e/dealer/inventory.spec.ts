import { test, expect } from '../fixtures/auth'

test.describe('E2E-D01 inventory', () => {
  test('inventory lists seeded vehicles and stats', async ({ page, loginAs }) => {
    await loginAs('dealer')
    await page.goto('/inventory')

    await expect(page.getByRole('heading', { name: /Vehicle Inventory/i })).toBeVisible()
    await expect(page.getByText(/Total Vehicles/i).first()).toBeVisible()
    await expect(page.getByText(/BMW X5 xDrive40i/i).first()).toBeVisible()
    await expect(page.getByText(/Honda Accord/i).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Add Vehicle/i })).toBeVisible()
  })
})
