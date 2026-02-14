import { describe, expect, it } from 'vitest'
import { addFavorite, clearFavorites, listFavorites, updateBookingRequestStatus } from '../customerService'

describe('customerService', () => {
  it('adds and clears favorites in mock mode', async () => {
    const initial = await listFavorites({ pageSize: 50 })
    await addFavorite('veh_1')
    const afterAdd = await listFavorites({ pageSize: 50 })
    expect(afterAdd.items.length).toBe(initial.items.length + 1)

    await clearFavorites()
    const afterClear = await listFavorites({ pageSize: 50 })
    expect(afterClear.items.length).toBe(0)
  })

  it('updates booking request status in mock mode', async () => {
    const initial = await listFavorites({ pageSize: 50 })
    expect(initial.items.length).toBeGreaterThanOrEqual(0)
    const requests = await updateBookingRequestStatus('req_1', 'approved')
    expect(requests.status).toBe('approved')
  })
})
