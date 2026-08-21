import type { Page } from '@playwright/test'
import { DEMO_ACCOUNTS } from '../fixtures/auth'

const DEFAULT_API_BASE = 'http://localhost:3001'

type AdminCustomer = {
  id: string
  email: string
  status?: string
}

/** Ensure the seeded demo customer is active (API fallback after suspend UI tests). */
export async function ensureCustomerActive(
  page: Page,
  email = DEMO_ACCOUNTS.customer.email,
  apiBase = DEFAULT_API_BASE
) {
  const listRes = await page.request.get(`${apiBase}/api/admin/customers?pageSize=100`)
  if (!listRes.ok()) return

  const body = (await listRes.json()) as { items?: AdminCustomer[] }
  const customer = body.items?.find((row) => row.email === email)
  if (!customer || customer.status === 'active') return

  await page.request.patch(`${apiBase}/api/admin/customers/${customer.id}/status`, {
    data: { status: 'active' },
  })
}
