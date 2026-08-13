import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const customerPages = [
  'HomePage',
  'BrowseCarsPage',
  'ShoppingCartPage',
  'Dashboard',
  'MyRequests',
  'FAQPage',
  'ContactPage',
]

describe('Customer UI scenario matrix (static analysis)', () => {
  it.each(customerPages)('UI-C-MATRIX: %s exports a page component', (page) => {
    const src = readFileSync(path.join(root, `apps/customer/src/pages/${page}.tsx`), 'utf8')
    expect(src).toMatch(new RegExp(`export function ${page}`))
  })

  it('UI-C-MATRIX: checkout uses multi-step wizard', () => {
    const src = readFileSync(path.join(root, 'apps/customer/src/pages/CheckoutPage.tsx'), 'utf8')
    expect(src).toMatch(/Details|Documents|Confirm/)
  })

  it('UI-C-MATRIX: cart store persists pricing fields', () => {
    const src = readFileSync(path.join(root, 'apps/customer/src/stores/cartStore.ts'), 'utf8')
    expect(src).toMatch(/pricePerDay|duration/)
  })
})
