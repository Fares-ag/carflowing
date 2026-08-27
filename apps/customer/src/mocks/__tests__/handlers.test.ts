import { getDb, updateDb } from '@carflow/shared'
import { describe, expect, it } from 'vitest'
import { recordConsents } from '../../services/consentService'
import {
  createRentalMaintenanceRequest,
  getBillingCapabilities,
  getMessageThread,
  getPricingSettings,
  getRentalSubscription,
  getUnreadMessageCount,
  getVehicleReviews,
  listMessageThreads,
  listRentalMaintenanceRequests,
  pauseRental,
  resumeRental,
  sendMessage,
} from '../../services/customerService'
import {
  createSkipCashInvoiceIntentWithSavedCard,
  retrySkipCashPayment,
} from '../../services/paymentService'

/**
 * Shape contract for the mock API. Every assertion here mirrors the real
 * Express handler (apps/backend/src/routes/) — a mock that answers with the
 * wrong shape is worse than no mock at all, because the UI is then built
 * against a fiction.
 */
describe('customer MSW handlers', () => {
  it('returns the vehicle review list with its aggregates', async () => {
    const reviews = await getVehicleReviews('veh_1')
    expect(reviews).toMatchObject({ reviewCount: 2, page: 1, total: 2 })
    expect(reviews.averageRating).toBe(4.5)
    expect(reviews.items[0]).toMatchObject({
      vehicleId: 'veh_1',
      rating: expect.any(Number),
      customerName: expect.any(String),
    })
  })

  it('serves catalog pricing settings and billing capabilities', async () => {
    await expect(getPricingSettings()).resolves.toMatchObject({
      subscriptionDepositAmount: expect.any(Number),
    })
    await expect(getBillingCapabilities()).resolves.toEqual({
      skipcashSavedCardsEnabled: expect.any(Boolean),
      skipcashSavedCardsChargeReady: expect.any(Boolean),
      capabilityRequired: expect.any(String),
    })
  })

  it('pauses and resumes a subscription, and refuses a second pause', async () => {
    const paused = await pauseRental('rental_1', { days: 14, reason: 'Travelling' })
    expect(paused.status).toBe('paused')
    expect(paused.pausedUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(paused.pauseReason).toBe('Travelling')

    await expect(pauseRental('rental_1')).rejects.toMatchObject({
      status: 409,
      message: 'Cannot pause a rental in status "paused"',
    })

    const resumed = await resumeRental('rental_1')
    expect(resumed.status).toBe('active')
    expect(resumed.pausedAt).toBeUndefined()
    expect(resumed.pausedUntil).toBeUndefined()
  })

  it('rejects a pause longer than the allowed hold', async () => {
    await expect(pauseRental('rental_1', { days: 400 })).rejects.toMatchObject({ status: 400 })
  })

  it('records a maintenance request and lists it back', async () => {
    const created = await createRentalMaintenanceRequest('rental_1', {
      description: 'Warning light on the dash.',
    })
    expect(created).toMatchObject({
      rentalId: 'rental_1',
      vehicleId: 'veh_1',
      status: 'requested',
      source: 'customer',
      title: 'Service request',
      scheduledAt: null,
      completedAt: null,
      photos: [],
    })

    const { items } = await listRentalMaintenanceRequests('rental_1')
    expect(items.map((m) => m.id)).toContain(created.id)
  })

  it('404s a maintenance request for an unknown rental', async () => {
    await expect(listRentalMaintenanceRequests('rental_nope')).rejects.toMatchObject({
      status: 404,
    })
  })

  it('sends a message and groups it into a thread', async () => {
    const sent = await sendMessage({
      toUserId: 'user_dealer_1',
      body: 'Can I book the 20k service next week?',
      rentalId: 'rental_1',
      subject: 'Service booking',
    })
    expect(sent).toMatchObject({
      fromUserId: 'user_customer_1',
      toUserId: 'user_dealer_1',
      folder: 'sent',
      subject: '[cf:rental:rental_1] Service booking',
    })

    const threads = await listMessageThreads()
    const thread = threads.find((t) => t.threadSubject === sent.subject)
    expect(thread).toMatchObject({
      displaySubject: 'Service booking',
      unreadCount: expect.any(Number),
    })
    expect(thread?.lastMessage.id).toBe(sent.id)

    const messages = await getMessageThread(sent.subject)
    expect(messages.some((m) => m.id === sent.id)).toBe(true)
    expect(await getUnreadMessageCount()).toBeGreaterThanOrEqual(0)
  })

  it('refuses a message with no resolvable subject', async () => {
    await expect(
      sendMessage({ toUserId: 'user_dealer_1', body: 'Hello?' })
    ).rejects.toMatchObject({ status: 400 })
  })

  it('records legal consents', async () => {
    await expect(recordConsents(['terms', 'privacy'])).resolves.toBeUndefined()
  })

  it('pays an invoice with a saved card and reports the hosted-checkout fallback', async () => {
    const sub = await getRentalSubscription('rental_1')
    const due = sub.invoices.find((inv) => inv.status === 'due')
    expect(due).toBeTruthy()

    const intent = await createSkipCashInvoiceIntentWithSavedCard(due!.id, 'pm_1')
    expect(intent).toMatchObject({
      paymentId: expect.any(String),
      payUrl: expect.stringContaining('paymentId='),
      savedCardAttempted: true,
      savedCardUsed: false,
    })
    expect(getDb().invoices.find((inv) => inv.id === due!.id)?.status).toBe('paid')
  })

  it('retries a failed payment and refuses to retry a completed one', async () => {
    await expect(retrySkipCashPayment('pay_1')).rejects.toMatchObject({
      status: 409,
      message: 'This payment has already completed',
    })

    updateDb((db) => ({
      ...db,
      payments: db.payments.map((p) => (p.id === 'pay_1' ? { ...p, status: 'failed' } : p)),
    }))
    const retry = await retrySkipCashPayment('pay_1')
    expect(retry.paymentId).not.toBe('pay_1')
    expect(retry.payUrl).toContain('paymentId=')
  })
})
