import { updateDb } from '@carflow/shared'
import { describe, expect, it } from 'vitest'
import { resendVerificationEmail } from '../authService'
import {
  cancelRental,
  cancelSwapRequest,
  createSwapRequest,
  getRentalSubscription,
  updateRentalStatus,
} from '../customerService'
import { createSkipCashInvoiceIntent } from '../paymentService'

describe('subscription endpoints (MSW smoke)', () => {
  it('rejects non-cancel status transitions with 403 (BUG-17)', async () => {
    await expect(updateRentalStatus('rental_1', 'active' as never)).rejects.toMatchObject({
      status: 403,
      message: 'Customers can only cancel their subscription',
    })
  })

  it('returns the subscription view with invoices and swap eligibility', async () => {
    const sub = await getRentalSubscription('rental_1')
    expect(sub.rental.id).toBe('rental_1')
    expect(sub.vehicle?.id).toBe('veh_1')
    expect(sub.invoices.length).toBeGreaterThanOrEqual(2)
    expect(sub.swapEligibleFrom).toBeTruthy()
    expect(sub.events.length).toBeGreaterThan(0)
  })

  it('pays a due invoice through invoice-intent and marks it paid', async () => {
    const sub = await getRentalSubscription('rental_1')
    const due = sub.invoices.find((inv) => inv.status === 'due')
    expect(due).toBeTruthy()
    const intent = await createSkipCashInvoiceIntent(due!.id)
    expect(intent.payUrl).toContain('paymentId=')
    const after = await getRentalSubscription('rental_1')
    expect(after.invoices.find((inv) => inv.id === due!.id)?.status).toBe('paid')
  })

  it('surfaces swap 409/400 errors verbatim and completes a swap round-trip', async () => {
    await expect(createSwapRequest('rental_1', { vehicleId: 'veh_2' })).rejects.toMatchObject({
      status: 409,
      message: 'That vehicle is not currently available',
    })
    await expect(createSwapRequest('rental_1', { vehicleId: 'veh_1' })).rejects.toMatchObject({
      status: 400,
    })
    updateDb((db) => ({
      ...db,
      vehicles: [
        ...db.vehicles,
        {
          id: 'veh_swap_target',
          dealerId: 'dealer_1',
          name: 'Nissan Patrol',
          make: 'Nissan',
          model: 'Patrol',
          year: 2024,
          category: 'suv' as const,
          status: 'available' as const,
          pricePerDay: 210,
          mileage: 4000,
          transmission: 'automatic' as const,
          fuelType: 'gas' as const,
          seats: 7,
        },
      ],
    }))
    const swap = await createSwapRequest('rental_1', { vehicleId: 'veh_swap_target', note: 'need more seats' })
    expect(swap.status).toBe('pending')
    await expect(
      createSwapRequest('rental_1', { vehicleId: 'veh_swap_target' })
    ).rejects.toMatchObject({ status: 409, message: 'You already have a pending swap request' })
    const withPending = await getRentalSubscription('rental_1')
    expect(withPending.swapRequests.some((s) => s.id === swap.id && s.status === 'pending')).toBe(true)
    const cancelled = await cancelSwapRequest(swap.id)
    expect(cancelled.status).toBe('cancelled')
  })

  it('schedules cancellation for an active rental and refuses a second request', async () => {
    const updated = await cancelRental('rental_1', { reason: 'moving abroad' })
    expect(updated.status).toBe('active')
    expect(updated.cancellationEffectiveDate).toBeTruthy()
    await expect(cancelRental('rental_1', {})).rejects.toMatchObject({
      status: 409,
      message: 'Cancellation is already scheduled',
    })
  })

  it('resends the verification email', async () => {
    await expect(resendVerificationEmail()).resolves.toBeUndefined()
  })
})
