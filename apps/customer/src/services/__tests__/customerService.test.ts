import { describe, expect, it } from 'vitest'
import { addFavorite, clearFavorites, listFavorites, updateBookingRequestStatus } from '../customerService'

describe('customerService (MSW)', () => {
  it('adds and clears favorites', async () => {
    const initial = await listFavorites({ pageSize: 50 })
    await addFavorite('veh_1')
    const afterAdd = await listFavorites({ pageSize: 50 })
    expect(afterAdd.items.length).toBeGreaterThanOrEqual(initial.items.length)

    await clearFavorites()
    const afterClear = await listFavorites({ pageSize: 50 })
    expect(afterClear.items.length).toBe(0)
  })

  it('updates booking request status', async () => {
    const updated = await updateBookingRequestStatus('req_1', 'approved')
    expect(updated.status).toBe('approved')
  })

  it('returns paginated list shape', async () => {
    const page = await listFavorites({ page: 1, pageSize: 5 })
    expect(page).toMatchObject({
      items: expect.any(Array),
      total: expect.any(Number),
      page: 1,
      pageSize: 5,
    })
  })
})
