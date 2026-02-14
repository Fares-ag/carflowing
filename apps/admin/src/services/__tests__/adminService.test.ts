import { describe, expect, it } from 'vitest'
import { createPlan, listPlans, updatePlan } from '../adminService'

describe('adminService', () => {
  it('creates and updates plans in mock mode', async () => {
    const initial = await listPlans()
    const created = await createPlan({
      name: 'Test Plan',
      tier: 'starter',
      status: 'active',
      priceMonthly: 49,
      priceYearly: 499,
      features: ['Feature A'],
    })
    const afterCreate = await listPlans()
    expect(afterCreate.length).toBe(initial.length + 1)

    const updated = await updatePlan(created.id, { status: 'archived' })
    expect(updated.status).toBe('archived')
  })
})
