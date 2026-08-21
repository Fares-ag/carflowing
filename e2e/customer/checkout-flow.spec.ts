import { test, expect } from '../fixtures/auth'



test.describe('E2E-C02 book on car detail', () => {

  test('logged-out user is redirected to login when requesting a car', async ({ page }) => {

    await page.goto('/browse')

    await page.getByRole('button', { name: /^book$/i }).first().click()

    await page.waitForURL(/\/car\//)

    await page.getByRole('button', { name: /sign in to continue/i }).click()

    await expect(page).toHaveURL(/login/)

  })



  test('E2E-S05 car detail shows book form for logged-in customer', async ({ page, loginAs }) => {

    await loginAs('customer')

    await page.goto('/browse')

    await page.getByRole('button', { name: /^book$/i }).first().click()

    await page.waitForURL(/\/car\//)

    await expect(page.getByRole('heading', { name: /book this car/i })).toBeVisible()

    await expect(page.getByRole('button', { name: /continue to checkout/i })).toBeVisible()

  })



  test('E2E-S06 payment status page reports a friendly error for an unknown SkipCash payment', async ({

    page,

    loginAs,

  }) => {

    await loginAs('customer')

    await page.goto('/payment-status?paymentId=00000000-0000-0000-0000-000000000000')

    await expect(page.getByText(/something went wrong/i)).toBeVisible()

  })

})


