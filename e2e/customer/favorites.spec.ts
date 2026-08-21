import { test, expect } from '../fixtures/auth'

test.describe('E2E-C04 favorites', () => {
  test('favorites redirect shows saved cars section', async ({ page, loginAs }) => {
    await loginAs('customer')
    await page.goto('/favorites')
    await expect(page).toHaveURL(/\/settings\?section=saved/)

    await expect(page.getByRole('heading', { name: /^Saved cars$/i })).toBeVisible()
    await expect(page.getByText(/No saved cars yet/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /Browse cars/i })).toBeVisible()
  })
})
