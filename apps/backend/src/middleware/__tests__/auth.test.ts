import type { NextFunction, Request, Response } from 'express'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { requireAuth, requireRole } from '../auth.js'

vi.mock('../../auth/tokens.js', () => ({
  ACCESS_COOKIE: 'cf_access',
  REFRESH_COOKIE: 'cf_refresh',
  verifyAccessToken: vi.fn(),
}))

vi.mock('../../auth/sessions.js', () => ({
  // Only the session the tests hand out as `sid` is live; anything else
  // (missing sid, revoked session) is treated as revoked.
  isSessionActiveByHash: vi.fn(async (_userId: string, sid?: string) => sid === 'live-session'),
}))

vi.mock('../../db/index.js', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ status: 'active', role: 'customer' }]),
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
    vi.mocked(verifyAccessToken).mockResolvedValue({
      sub: 'u1',
      role: 'customer',
      email: 'c@test.dev',
      sid: 'live-session',
    })
    const req = { cookies: { cf_access: 'token' } } as unknown as Request
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

  it('requireAuth overwrites JWT role with the database role', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      sub: 'u1',
      role: 'admin',
      email: 'c@test.dev',
      sid: 'live-session',
    })
    const req = { cookies: { cf_access: 'token' } } as unknown as Request
    const next = vi.fn()
    await requireAuth(req as any, {} as Response, next)
    expect(next).toHaveBeenCalled()
    expect((req as any).user.role).toBe('customer')
  })

  it('requireAuth rejects an access token whose refresh session was revoked', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      sub: 'u1',
      role: 'customer',
      email: 'c@test.dev',
      sid: 'revoked-session',
    })
    const req = { cookies: { cf_access: 'token' } } as unknown as Request
    const json = vi.fn()
    const status = vi.fn(() => ({ json }))
    const next = vi.fn()
    await requireAuth(req as any, { status } as unknown as Response, next)
    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(401)
  })

  it('requireAuth rejects a legacy access token that carries no session binding', async () => {
    vi.mocked(verifyAccessToken).mockResolvedValue({
      sub: 'u1',
      role: 'customer',
      email: 'c@test.dev',
    })
    const req = { cookies: { cf_access: 'token' } } as unknown as Request
    const json = vi.fn()
    const status = vi.fn(() => ({ json }))
    const next = vi.fn()
    await requireAuth(req as any, { status } as unknown as Response, next)
    expect(next).not.toHaveBeenCalled()
    expect(status).toHaveBeenCalledWith(401)
  })
})
