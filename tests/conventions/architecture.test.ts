import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function exists(rel: string) {
  return fs.existsSync(path.join(root, rel))
}

describe('BP-ARCH architecture conventions', () => {
  it('BP-ARCH-02: all apps wrap root with ErrorBoundary', () => {
    for (const app of ['customer', 'dealer', 'admin']) {
      const main = read(`apps/${app}/src/main.tsx`)
      expect(main).toMatch(/ErrorBoundary/)
    }
  })

  it('BP-ARCH-06: each app has a domain service module', () => {
    expect(exists('apps/customer/src/services/customerService.ts')).toBe(true)
    expect(exists('apps/dealer/src/services/dealerService.ts')).toBe(true)
    expect(exists('apps/admin/src/services/adminService.ts')).toBe(true)
  })

  it('BP-ARCH-04: backend routes live under apps/backend/src/routes', () => {
    expect(exists('apps/backend/src/routes/auth.ts')).toBe(true)
    expect(exists('apps/backend/src/routes/customer.ts')).toBe(true)
  })
})

describe('BP-SEC security conventions', () => {
  it('BP-SEC-01: login pages start with empty credential state', () => {
    for (const app of ['customer', 'dealer', 'admin']) {
      const files = fs.readdirSync(path.join(root, `apps/${app}/src/pages`))
      const loginFile = files.find((f) => f.endsWith('.tsx') && f.toLowerCase().includes('login'))
      if (!loginFile) continue
      const src = read(`apps/${app}/src/pages/${loginFile}`)
      expect(src).toMatch(/useState\(\s*['"]{2}\s*\)/)
    }
  })

  it('BP-SEC-04: auth tokens use httpOnly cookies in backend', () => {
    const tokens = read('apps/backend/src/auth/tokens.ts')
    expect(tokens).toMatch(/httpOnly:\s*true/)
  })
})

describe('BP-API api design conventions', () => {
  it('BP-API-03: protected routers use requireAuth middleware', () => {
    for (const file of ['customer.ts', 'dealer.ts', 'admin.ts']) {
      const src = read(`apps/backend/src/routes/${file}`)
      expect(src).toMatch(/requireAuth/)
      expect(src).toMatch(/requireRole/)
    }
  })
})

describe('BP-REACT react conventions', () => {
  it('BP-REACT-04: apps define ProtectedRoute component', () => {
    for (const app of ['customer', 'dealer', 'admin']) {
      expect(exists(`apps/${app}/src/components/ProtectedRoute.tsx`)).toBe(true)
    }
  })

  it('BP-REACT-07: recharts imports include chart components', () => {
    for (const app of ['customer', 'dealer', 'admin']) {
      const pagesDir = path.join(root, `apps/${app}/src`)
      const walk = (dir: string): string[] =>
        fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
          const p = path.join(dir, e.name)
          return e.isDirectory() ? walk(p) : e.name.endsWith('.tsx') ? [p] : []
        })
      const files = walk(pagesDir)
      for (const file of files) {
        const src = fs.readFileSync(file, 'utf8')
        if (/from ['"]recharts['"]/.test(src)) {
          expect(src).toMatch(/<(?:LineChart|BarChart|PieChart|AreaChart|ComposedChart)\b/)
        }
      }
    }
  })
})
