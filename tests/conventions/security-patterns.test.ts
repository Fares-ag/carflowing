import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('BP-SEC security pattern conventions', () => {
  it('BP-SEC-02: backend sets helmet or security headers middleware', () => {
    const app = fs.readFileSync(path.join(root, 'apps/backend/src/app.ts'), 'utf8')
    expect(app).toMatch(/helmet/)
  })

  it('BP-SEC-04: auth login/signup/forgot-password routes are rate-limited', () => {
    const app = fs.readFileSync(path.join(root, 'apps/backend/src/app.ts'), 'utf8')
    expect(app).toMatch(/rateLimit/)
    expect(app).toMatch(/\/api\/auth\/login/)
    expect(app).toMatch(/\/api\/auth\/signup/)
    expect(app).toMatch(/\/api\/auth\/forgot-password/)
    // Production-only enforcement (skipped in local/test)
    expect(app).toMatch(/NODE_ENV/)
  })

  it('BP-SEC-03: upload routes require authentication', () => {
    const uploads = fs.readFileSync(path.join(root, 'apps/backend/src/routes/uploads.ts'), 'utf8')
    expect(uploads).toMatch(/requireAuth/)
  })

  it('BP-SEC-05: passwords hashed with bcrypt in auth routes', () => {
    const auth = fs.readFileSync(path.join(root, 'apps/backend/src/routes/auth.ts'), 'utf8')
    expect(auth).toMatch(/hashPassword|comparePassword/)
  })

  it('BP-SEC-06: JWT secrets read from environment', () => {
    const tokens = fs.readFileSync(path.join(root, 'apps/backend/src/auth/tokens.ts'), 'utf8')
    expect(tokens).toMatch(/process\.env/)
  })
})
