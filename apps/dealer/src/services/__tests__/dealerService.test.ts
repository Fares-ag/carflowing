import { describe, expect, it } from 'vitest'
import { createLead, createVehicle, listInventory, listLeads, updateVehicleStatus } from '../dealerService'

describe('dealerService', () => {
  it('creates vehicles and updates status in mock mode', async () => {
    const initial = await listInventory({ pageSize: 50 })
    const created = await createVehicle({
      dealerId: 'dealer_1',
      name: 'Test Vehicle',
      make: 'Test',
      model: 'Vehicle',
      year: 2025,
      category: 'sedan',
      status: 'available',
      pricePerDay: 120,
      mileage: 0,
      transmission: 'automatic',
      fuelType: 'gas',
      seats: 5,
    })
    const afterCreate = await listInventory({ pageSize: 50 })
    expect(afterCreate.items.length).toBe(initial.items.length + 1)

    const updated = await updateVehicleStatus(created.id, 'maintenance')
    expect(updated.status).toBe('maintenance')
  })

  it('creates leads in mock mode', async () => {
    const initial = await listLeads({ pageSize: 50 })
    await createLead({
      name: 'Test Lead',
      email: 'lead@example.com',
      source: 'Website',
      stage: 'new',
    })
    const afterCreate = await listLeads({ pageSize: 50 })
    expect(afterCreate.items.length).toBe(initial.items.length + 1)
  })
})
