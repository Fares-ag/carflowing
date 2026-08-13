import { test, expect } from '../fixtures/auth'



test.describe('E2E-M01 mobile book flow usability', () => {

  test.use({ viewport: { width: 375, height: 812 } })



  test('browse and car detail usable on mobile', async ({ page, loginAs }) => {

    await loginAs(page, 'customer')

    await page.goto('/browse')

    await expect(page.locator('body')).toBeVisible()

    await page.getByRole('button', { name: /^book$/i }).first().click()

    await expect(page).toHaveURL(/\/car\//)

    await expect(page.getByRole('heading', { name: /book this car/i })).toBeVisible()

  })

})


