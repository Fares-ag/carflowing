import { test, expect } from '../fixtures/auth'



test.describe('E2E-C05 my booking hub', () => {

  test('my booking page loads', async ({ page, loginAs }) => {

    await loginAs(page, 'customer')

    await page.goto('/my-booking')

    await expect(page.getByRole('heading', { name: /my booking/i })).toBeVisible()

  })



  test('legacy /requests redirects to my booking', async ({ page, loginAs }) => {

    await loginAs(page, 'customer')

    await page.goto('/requests')

    await expect(page).toHaveURL(/\/my-booking/)

  })

})


