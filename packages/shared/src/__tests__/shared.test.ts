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
})
