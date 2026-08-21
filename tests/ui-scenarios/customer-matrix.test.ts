import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const customerPages = [
  'HomePage',
  'BrowseCarsPage',
  'CarDetailPage',
  'MyBookingPage',
  'CheckoutPage',
  'AccountSettings',
  'FAQPage',
  'ContactPage',
]

describe('Customer UI scenario matrix (static analysis)', () => {
  it.each(customerPages)('UI-C-MATRIX: %s exports a page component', (page) => {
    const src = readFileSync(path.join(root, `apps/customer/src/pages/${page}.tsx`), 'utf8')
    expect(src).toMatch(new RegExp(`export (?:function|const) ${page}`))
  })

  it('UI-C-MATRIX: checkout collects identity and payment details', () => {
    const src = readFileSync(path.join(root, 'apps/customer/src/pages/CheckoutPage.tsx'), 'utf8')
    expect(src).toMatch(/Qatar ID|QID/i)
    expect(src).toMatch(/skipcash_online|pay_at_shop/)
  })

  it('UI-C-MATRIX: cart store persists pricing fields', () => {
    const src = readFileSync(path.join(root, 'apps/customer/src/stores/cartStore.ts'), 'utf8')
    expect(src).toMatch(/pricePerDay|duration/)
  })
})
