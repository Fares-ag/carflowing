import { test, expect } from '../fixtures/auth'



test.describe('E2E-C01 browse and book', () => {

  test('browse vehicles and open car detail', async ({ page, loginAs }) => {

    await loginAs(page, 'customer')

    await page.goto('/browse')

    await expect(page.locator('body')).toBeVisible()

    await page.getByRole('button', { name: /^book$/i }).first().click()

    await expect(page).toHaveURL(/\/car\//)

  })

})


