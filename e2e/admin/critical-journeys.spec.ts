import { test, expect, DEMO_ACCOUNTS } from '../fixtures/auth'
import { ensureCustomerActive } from '../helpers/admin-api'

const ADMIN_BASE = 'http://localhost:5174'

test.describe('ADM-E2E critical admin journeys', () => {
  test('ADM-E2E-01: login redirect preserves deep link', async ({ page }) => {
    await page.goto(`${ADMIN_BASE}/login?redirect=${encodeURIComponent('/customers')}`)
    await page.getByLabel('Email').fill('admin@carflow.dev')
    await page.getByLabel('Password').fill('password123')
    await page.getByRole('button', { name: /^Sign in$/i }).click()
    await expect(page).toHaveURL(/\/customers/)
  })

  test('ADM-SEC-04: logout clears session and returns to login', async ({ page, loginAs }) => {
    await loginAs('admin')
    await page.getByRole('button', { name: /^Logout$/i }).click()
    await expect(page).toHaveURL(/\/login/)
    await page.goto(`${ADMIN_BASE}/dashboard`)
    await expect(page).toHaveURL(/\/login/)
  })

  test('ADM-E2E-04: admin suspends a customer with confirmation', async ({ page, loginAs }) => {
    await loginAs('admin')
    const customerRow = page.getByRole('row').filter({ hasText: DEMO_ACCOUNTS.customer.email })

    try {
      await page.goto(`${ADMIN_BASE}/customers`)
      await expect(page.getByText(/Customers/i).first()).toBeVisible({ timeout: 15000 })
      await expect(customerRow).toBeVisible({ timeout: 15000 })

      const suspendBtn = customerRow.getByRole('button', { name: /^Suspend$/i })
      await expect(suspendBtn).toBeVisible()
      await suspendBtn.click()
      await page.getByRole('button', { name: /^Suspend$/i }).last().click()
      await expect(customerRow.getByText(/Suspended/i)).toBeVisible({ timeout: 10000 })

      const activateBtn = customerRow.getByRole('button', { name: /^Activate$/i })
      await activateBtn.click()
      await page.getByRole('button', { name: /^Activate$/i }).last().click()
      await expect(customerRow.getByText(/Active/i)).toBeVisible({ timeout: 10000 })
    } finally {
      await loginAs('admin').catch(() => {})
      await ensureCustomerActive(page, DEMO_ACCOUNTS.customer.email)
    }
  })

  test('ADM-E2E-12: admin approves a pending booking request', async ({ page, loginAs }) => {
    await loginAs('admin')
    await page.goto(`${ADMIN_BASE}/booking-requests`)
    await expect(page.getByText(/Booking Requests/i).first()).toBeVisible({ timeout: 15000 })
    const approveBtn = page.getByRole('button', { name: /^Approve$/i }).first()
    if (await approveBtn.isVisible()) {
      await approveBtn.click()
      await expect(page.getByText(/approved/i).first()).toBeVisible({ timeout: 10000 })
    }
  })

  test('ADM-E2E-12b: admin declines a booking with reason', async ({ page, loginAs }) => {
    await loginAs('admin')
    await page.goto(`${ADMIN_BASE}/booking-requests`)
    const declineBtn = page.getByRole('button', { name: /^Decline$/i }).first()
    if (await declineBtn.isVisible()) {
      await declineBtn.click()
      await page.locator('.brDeclineTextarea').fill('Vehicle unavailable for requested dates')
      await page.getByRole('button', { name: /^Decline request$/i }).click()
      await expect(page.getByText(/declined/i).first()).toBeVisible({ timeout: 10000 })
    }
  })

  test('ADM-E2E-06: admin opens add dealer modal', async ({ page, loginAs }) => {
    await loginAs('admin')
    await page.goto(`${ADMIN_BASE}/dealers`)
    await page.getByRole('button', { name: /Add Dealer/i }).click()
    await expect(page.getByText(/Add Dealer|Dealer name/i).first()).toBeVisible()
  })

  test('ADM-E2E-08: admin opens add car modal', async ({ page, loginAs }) => {
    await loginAs('admin')
    await page.goto(`${ADMIN_BASE}/cars`)
    await page.getByRole('button', { name: /Add Car for Dealer/i }).click()
    await expect(page.getByText(/Add Car on Behalf of Dealer/i)).toBeVisible()
  })

  test('ADM-E2E-14: payments page loads refund-capable rows', async ({ page, loginAs }) => {
    await loginAs('admin')
    await page.goto(`${ADMIN_BASE}/payments`)
    await expect(page.getByText(/Payments/i).first()).toBeVisible({ timeout: 15000 })
    const refundBtn = page.getByRole('button', { name: /^Refund$/i }).first()
    if (await refundBtn.isVisible()) {
      await refundBtn.click()
      await expect(page.getByText(/Refund payment/i)).toBeVisible()
    }
  })
})
