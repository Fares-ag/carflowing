import { test, expect } from '../fixtures/auth'

const adminRoutes = [
  '/dashboard',
  '/cars',
  '/customers',
  '/dealers',
  '/rental',
  '/payments',
  '/plans',
  '/booking-requests',
  '/complaints',
  '/messages',
  '/analytics',
  '/settings',
]

test.describe('E2E-A admin pages smoke', () => {
  for (const route of adminRoutes) {
    test(`loads ${route}`, async ({ page, loginAs }) => {
      await loginAs(page, 'admin')
      await page.goto(route)
      await expect(page.locator('body')).toBeVisible()
    })
  }
})
