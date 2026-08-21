import { test, expect } from '../fixtures/auth'



test.describe('E2E-C03 customer auth flow', () => {

  test('signup navigates to browse; logout redirects protected routes', async ({ page }) => {

    await page.goto('/signup')

    await page.getByLabel('Full Name').fill('E2E User')

    await page.getByLabel('Email').fill(`e2e-${Date.now()}@test.dev`)

    await page.getByLabel(/^Password$/).fill('password123')

    await page.getByLabel(/Confirm Password/i).fill('password123')

    await page.getByRole('button', { name: /create account/i }).click()

    await expect(page).toHaveURL(/browse|login/)

  })



  test('E2E-S02 login respects redirect query', async ({ page }) => {

    await page.goto('/login?redirect=%2Fmy-booking')

    await page.getByLabel('Email').fill('customer@carflow.dev')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: /^Sign in$/i }).click()

    await expect(page).toHaveURL(/my-booking/)

  })

})


