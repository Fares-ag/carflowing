import { test, expect } from '../fixtures/auth'



test.describe('E2E-X01 full booking lifecycle', () => {

  test('customer books → dealer approves → customer sees rental', async ({ page, loginAs }) => {

    await loginAs(page, 'customer')

    await page.goto('/browse')

    await page.waitForLoadState('networkidle')



    await page.getByRole('button', { name: /^book$/i }).first().click()

    await page.waitForURL(/\/car\//)



    await page.getByRole('button', { name: /request this car/i }).click()



    await expect(page).toHaveURL(/\/my-booking/, { timeout: 15000 })

    await expect(page.getByText(/request sent|waiting for the dealer/i).first()).toBeVisible({ timeout: 15000 })



    await page.goto('http://localhost:5175/login')

    await loginAs(page, 'dealer')

    await page.goto('http://localhost:5175/requests')

    const approve = page.getByRole('button', { name: /^approve$/i }).first()

    await expect(approve).toBeVisible({ timeout: 15000 })

    await approve.click()

    await page.getByRole('dialog', { name: /approve request/i }).getByRole('button', { name: /^approve$/i }).click()

    await expect(page.getByText(/approved/i).first()).toBeVisible({ timeout: 15000 })



    await page.goto('http://localhost:5173/login')

    await loginAs(page, 'customer')

    await page.goto('/my-booking')

    await expect(page.getByText(/approved|active rental/i).first()).toBeVisible({ timeout: 15000 })

  })

})


