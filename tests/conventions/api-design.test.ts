import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('BP-API api design conventions', () => {
  it('BP-API-01: routers mounted under /api prefix', () => {
    const app = fs.readFileSync(path.join(root, 'apps/backend/src/app.ts'), 'utf8')
    expect(app).toMatch(/\/api\/auth|\/api\/customer|\/api\/dealer|\/api\/admin/)
  })

  it('BP-API-02: domain routes use asyncHandler wrapper', () => {
    for (const file of ['customer.ts', 'dealer.ts', 'admin.ts']) {
      const src = fs.readFileSync(path.join(root, `apps/backend/src/routes/${file}`), 'utf8')
      expect(src).toMatch(/asyncHandler/)
    }
  })

  it('BP-API-04: list endpoints support pagination query params', () => {
    const customer = fs.readFileSync(path.join(root, 'apps/backend/src/routes/customer.ts'), 'utf8')
    expect(customer).toMatch(/parsePagination|pageSize|page/)
  })

  it('BP-API-05: error responses use JSON error field', () => {
    const middleware = fs.readFileSync(path.join(root, 'apps/backend/src/middleware/auth.ts'), 'utf8')
    expect(middleware).toMatch(/json\(\{\s*error:/)
  })
})
