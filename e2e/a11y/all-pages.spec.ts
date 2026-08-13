import { test, expect } from '../fixtures/auth'

const customerRoutes = ['/', '/browse', '/login', '/signup', '/faq', '/contact']

test.describe('BP-A11Y-01 customer public pages', () => {
  for (const route of customerRoutes) {
    test(`renders ${route} without crashing`, async ({ page }) => {
      await page.goto(route)
      await expect(page.locator('body')).toBeVisible()
    })
  }
})
