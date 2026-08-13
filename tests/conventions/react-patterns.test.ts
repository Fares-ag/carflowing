import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('BP-REACT react pattern conventions', () => {
  it('BP-REACT-01: apps use AuthContext provider', () => {
    for (const app of ['customer', 'dealer', 'admin']) {
      const main = fs.readFileSync(path.join(root, `apps/${app}/src/main.tsx`), 'utf8')
      expect(main).toMatch(/AuthProvider/)
    }
  })

  it('BP-REACT-03: customer app uses zustand cart store', () => {
    expect(fs.existsSync(path.join(root, 'apps/customer/src/stores/cartStore.ts'))).toBe(true)
  })

  it('BP-REACT-05: pages avoid default export except App/main', () => {
    for (const app of ['customer', 'dealer', 'admin']) {
      const pagesDir = path.join(root, `apps/${app}/src/pages`)
      const pages = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.tsx'))
      for (const page of pages) {
        const src = fs.readFileSync(path.join(pagesDir, page), 'utf8')
        expect(src).toMatch(/export (function |const \w+ = memo\()/)
      }
    }
  })
})
