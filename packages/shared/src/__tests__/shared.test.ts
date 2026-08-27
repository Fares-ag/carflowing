import { describe, expect, it } from 'vitest'
import { ApiError, apiRequest } from '../apiClient.js'
import { createId, getDb, paginate, updateDb } from '../mockDb.js'

describe('mockDb', () => {
  it('paginates and creates ids', () => {
    const db = getDb()
    const page = paginate(db.vehicles, 1, 2)
    expect(page.items.length).toBeLessThanOrEqual(2)
    expect(createId('veh')).toMatch(/^veh_/)
  })

  it('updateDb mutates persisted mock state', () => {
    updateDb((db) => ({ ...db, favorites: [] }))
    expect(getDb().favorites).toEqual([])
  })
})

describe('apiClient', () => {
  it('throws ApiError with status on failed fetch', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: 'nope' }), { status: 403 }) as Response
    await expect(apiRequest('/missing')).rejects.toMatchObject({ status: 403 })
    globalThis.fetch = originalFetch
  })

  it('ApiError carries message and status', () => {
    const err = new ApiError('bad', 400, { error: 'bad' })
    expect(err.name).toBe('ApiError')
    expect(err.status).toBe(400)
  })

  /**
   * Regression: the error path used to call response.json() and then fall back
   * to response.text(), which throws "body stream already read" on any non-JSON
   * error body. That escaped as a raw TypeError, so callers lost the status —
   * including the 401 that drives the session-expiry redirect.
   */
  it('keeps the status when the error body is not JSON (proxy 502 page)', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () =>
      new Response('<html><body>502 Bad Gateway</body></html>', {
        status: 502,
        headers: { 'Content-Type': 'text/html' },
      }) as Response
    await expect(apiRequest('/customer/rentals')).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      message: 'Request failed',
      details: '<html><body>502 Bad Gateway</body></html>',
    })
    globalThis.fetch = originalFetch
  })

  it('surfaces a 401 as ApiError after the refresh attempt fails', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async (input: RequestInfo | URL) =>
      new Response(String(input).includes('/auth/refresh') ? '' : 'Unauthorized', {
        status: 401,
      }) as Response
    await expect(apiRequest('/customer/dashboard')).rejects.toMatchObject({
      name: 'ApiError',
      status: 401,
    })
    globalThis.fetch = originalFetch
  })

  it('tolerates an empty error body', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => new Response('', { status: 429 }) as Response
    await expect(apiRequest('/customer/rentals')).rejects.toMatchObject({
      status: 429,
      message: 'Request failed',
      details: null,
    })
    globalThis.fetch = originalFetch
  })
})
