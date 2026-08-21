import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

const APP_DIRS = ['apps/customer/src', 'apps/dealer/src', 'apps/admin/src'] as const

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return entry.name.endsWith('.ts') || entry.name.endsWith('.tsx') ? [full] : []
  })
}

describe('BP-FMT formatting conventions', () => {
  it('BP-FMT-01: app code uses formatCurrency instead of raw QAR template literals', () => {
    const hits: string[] = []
    for (const appDir of APP_DIRS) {
      for (const file of walk(path.join(root, appDir))) {
        const rel = path.relative(root, file)
        const src = fs.readFileSync(file, 'utf8')
        if (/`QAR \$\{/.test(src)) hits.push(rel)
      }
    }
    expect(hits).toEqual([])
  })

  it('BP-FMT-02: app code uses shared date helpers instead of toLocaleDateString', () => {
    const hits: string[] = []
    for (const appDir of APP_DIRS) {
      for (const file of walk(path.join(root, appDir))) {
        const rel = path.relative(root, file)
        const src = fs.readFileSync(file, 'utf8')
        if (/\.toLocaleDateString\s*\(/.test(src)) hits.push(rel)
      }
    }
    expect(hits).toEqual([])
  })

  it('BP-FMT-03: apps import ProtectedRoute from @carflow/shared (no local copy)', () => {
    for (const app of ['customer', 'dealer', 'admin'] as const) {
      expect(fs.existsSync(path.join(root, `apps/${app}/src/components/ProtectedRoute.tsx`))).toBe(false)
      expect(fs.existsSync(path.join(root, `apps/${app}/src/services/apiClient.ts`))).toBe(false)
    }
  })
})
