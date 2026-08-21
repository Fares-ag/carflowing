import { test } from '../fixtures/auth'
import { expectNoA11yViolations } from '../helpers/a11y'

const DEALER_BASE = 'http://localhost:5175'
const ADMIN_BASE = 'http://localhost:5174'

const customerPublicRoutes = ['/', '/browse', '/login', '/faq', '/contact'] as const

test.describe('BP-A11Y-01 customer public pages', () => {
  for (const route of customerPublicRoutes) {
    test(`no a11y violations on ${route}`, async ({ page }) => {
      await page.goto(route)
      await page.waitForLoadState('domcontentloaded')
      await expectNoA11yViolations(page)
    })
  }
})

test.describe('BP-A11Y-02 customer authenticated pages', () => {
  test('settings billing section', async ({ page, loginAs }) => {
    await loginAs('customer')
    await page.goto('/settings?section=billing')
    await page.getByRole('heading', { name: /^Billing$/i }).waitFor()
    await expectNoA11yViolations(page)
  })

  test('my booking page', async ({ page, loginAs }) => {
    await loginAs('customer')
    await page.goto('/my-booking')
    await page.locator('body').waitFor({ state: 'visible' })
    await expectNoA11yViolations(page)
  })
})

test.describe('BP-A11Y-03 dealer pages', () => {
  test('inventory', async ({ page, loginAs }) => {
    await loginAs('dealer')
    await page.goto(`${DEALER_BASE}/inventory`)
    await page.getByRole('heading', { name: /Vehicle Inventory/i }).waitFor()
    await expectNoA11yViolations(page)
  })

  test('leads CRM', async ({ page, loginAs }) => {
    await loginAs('dealer')
    await page.goto(`${DEALER_BASE}/leads`)
    await page.getByRole('heading', { name: /Leads Management/i }).waitFor()
    await expectNoA11yViolations(page)
  })

  test('analytics dashboard', async ({ page, loginAs }) => {
    await loginAs('dealer')
    await page.goto(`${DEALER_BASE}/analytics`)
    await page.getByRole('heading', { name: /Advanced Analytics/i }).waitFor()
    await expectNoA11yViolations(page)
  })
})

test.describe('BP-A11Y-04 admin pages', () => {
  test('dashboard', async ({ page, loginAs }) => {
    await loginAs('admin')
    await page.goto(`${ADMIN_BASE}/dashboard`)
    await page.locator('body').waitFor({ state: 'visible' })
    await expectNoA11yViolations(page)
  })

  test('customers', async ({ page, loginAs }) => {
    await loginAs('admin')
    await page.goto(`${ADMIN_BASE}/customers`)
    await page.getByText(/Customers/i).first().waitFor()
    await expectNoA11yViolations(page)
  })

  test('booking requests', async ({ page, loginAs }) => {
    await loginAs('admin')
    await page.goto(`${ADMIN_BASE}/booking-requests`)
    await page.getByText(/Booking Requests/i).first().waitFor()
    await expectNoA11yViolations(page)
  })
})
