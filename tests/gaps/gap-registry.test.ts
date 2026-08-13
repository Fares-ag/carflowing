import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const registryPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../gap-registry.json')
const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8')) as {
  gaps: Array<{ id: string; priority: string; status: string; title: string; testFile?: string }>
}

describe('Gap registry', () => {
  it('loads documented gaps from tests/gap-registry.json', () => {
    expect(registry.gaps.length).toBeGreaterThan(40)
    expect(registry.gaps.some((g) => g.id === 'GAP-P0-001')).toBe(true)
  })

  it('every P0 gap references a test file', () => {
    const p0 = registry.gaps.filter((g) => g.priority === 'P0')
    expect(p0.every((g) => g.testFile)).toBe(true)
  })
})
