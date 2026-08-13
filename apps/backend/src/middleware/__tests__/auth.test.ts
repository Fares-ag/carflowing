import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { NextFunction, Request, Response } from 'express'
import { requireAuth, requireRole } from '../auth.js'

vi.mock('../../auth/tokens.js', () => ({
  ACCESS_COOKIE: 'cf_access',
  REFRESH_COOKIE: 'cf_refresh',
  verifyAccessToken: vi.fn(),
}))

vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ status: 'active' }]),
        })),
      })),
    })),
  },
}))

import { verifyAccessToken } from '../../auth/tokens.js'

describe('auth middleware', () => {
  beforeEach(() => {
    vi.mocked(verifyAccessToken).mockReset()
  })

  it('requireAuth returns 401 when cookie missing', async () => {
    const req = { cookies: {} } as Request
    const json = vi.fn()
    const status = vi.fn(() => ({ json }))
    await requireAuth(req as any, { status } as unknown as Response, vi.fn() as NextFunction)
    expect(status).toHaveBeenCalledWith(401)
  })

  it('requireAuth attaches user on valid token', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({ sub: 'u1', role: 'customer', email: 'c@test.dev' })
    const req = { cookies: { cf_access: 'token' } } as Request
    const next = vi.fn()
    await requireAuth(req as any, {} as Response, next)
    expect(next).toHaveBeenCalled()
    expect((req as any).user.role).toBe('customer')
  })

  it('requireRole blocks wrong role with 403', () => {
    const middleware = requireRole('admin')
    const req = { user: { sub: 'u1', role: 'customer', email: 'c@test.dev' } }
    const json = vi.fn()
    const status = vi.fn(() => ({ json }))
    middleware(req as any, { status } as unknown as Response, vi.fn())
    expect(status).toHaveBeenCalledWith(403)
  })
})
