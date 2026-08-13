import { test as base, expect, type Page } from '@playwright/test'

export const DEMO_ACCOUNTS = {
  customer: { email: 'customer@carflow.dev', password: 'password123' },
  dealer: { email: 'dealer@carflow.dev', password: 'password123' },
  admin: { email: 'admin@carflow.dev', password: 'password123' },
} as const

export type Role = keyof typeof DEMO_ACCOUNTS

const APP_BASE: Record<Role, string> = {
  customer: 'http://localhost:5173',
  dealer: 'http://localhost:5175',
  admin: 'http://localhost:5174',
}

export async function loginAs(page: Page, role: Role) {
  const { email, password } = DEMO_ACCOUNTS[role]
  await page.goto(`${APP_BASE[role]}/login`)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: /^Sign in$/i }).click()
  await expect(page).not.toHaveURL(/\/login$/)
}

type Fixtures = {
  loginAs: (role: Role) => Promise<void>
}

export const test = base.extend<Fixtures>({
  loginAs: async ({ page }, use) => {
    await use((role) => loginAs(page, role))
  },
})

export { expect }
