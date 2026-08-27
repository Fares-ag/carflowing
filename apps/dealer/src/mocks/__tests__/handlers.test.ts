import { describe, expect, it } from 'vitest'
import {
  acceptDealerMaintenance,
  acknowledgePickupFulfilment,
  cancelDealerSubscription,
  changeDealerSubscriptionPlan,
  getDealerBillingState,
  getDealerMessageThread,
  getDealerUnreadMessageCount,
  listDealerBillingInvoices,
  listDealerBillingPlans,
  listDealerMaintenance,
  listDealerMessageThreads,
  listDealerMessages,
  listDealerReviews,
  markDealerMessageRead,
  moveDealerMessageToFolder,
  respondToDealerReview,
  scheduleDealerMaintenance,
  sendDealerMessage,
} from '../../services/dealerService'
import { getSecurityStatus, setup2fa } from '../../services/securityService'

/**
 * Shape contract for the mock API. Every assertion here mirrors the real
 * Express handler (apps/backend/src/routes/dealer.ts) — a mock that answers
 * with the wrong shape is worse than no mock at all.
 */
describe('dealer MSW handlers', () => {
  it('acknowledges pickup fulfilment on an open rental', async () => {
    const rental = await acknowledgePickupFulfilment('rental_1', 'scheduled')
    expect(rental).toMatchObject({ id: 'rental_1', pickupFulfilmentStatus: 'scheduled' })
    const delivered = await acknowledgePickupFulfilment('rental_1', 'delivered')
    expect(delivered.pickupFulfilmentStatus).toBe('delivered')
  })

  it('lists maintenance as a page, not a bare array', async () => {
    const page = await listDealerMaintenance()
    expect(page).toMatchObject({ page: 1, pageSize: 10, total: expect.any(Number) })
    expect(page.items[0]).toMatchObject({
      id: expect.any(String),
      vehicleId: expect.any(String),
      dealerId: expect.any(String),
      status: expect.any(String),
      photos: expect.any(Array),
    })
  })

  it('accepts then schedules a customer service request', async () => {
    const accepted = await acceptDealerMaintenance('mnt_1')
    expect(accepted).toMatchObject({ id: 'mnt_1', status: 'open', source: 'customer' })

    await expect(acceptDealerMaintenance('mnt_1')).rejects.toMatchObject({
      status: 409,
      message: 'Only pending customer requests can be accepted',
    })

    const scheduled = await scheduleDealerMaintenance('mnt_1', '2026-03-02T07:00:00.000Z')
    expect(scheduled).toMatchObject({ status: 'scheduled' })
    expect(scheduled.scheduledAt).toBe('2026-03-02T07:00:00.000Z')
  })

  it('404s maintenance actions on an unknown record', async () => {
    await expect(acceptDealerMaintenance('mnt_nope')).rejects.toMatchObject({ status: 404 })
  })

  it('sends a message, threads it, and flips read/folder flags', async () => {
    const sent = await sendDealerMessage({
      toUserId: 'user_customer_1',
      body: 'Your service slot is confirmed for Tuesday.',
      rentalId: 'rental_1',
      subject: 'Service booking',
    })
    expect(sent).toMatchObject({
      fromUserId: 'user_dealer_1',
      toUserId: 'user_customer_1',
      folder: 'sent',
      subject: '[cf:rental:rental_1] Service booking',
      fromName: expect.any(String),
    })

    const threads = await listDealerMessageThreads()
    const thread = threads.find((t) => t.threadSubject === sent.subject)
    expect(thread).toMatchObject({ displaySubject: 'Service booking' })
    expect(thread?.lastMessage.id).toBe(sent.id)

    const messages = await getDealerMessageThread(sent.subject)
    expect(messages.some((m) => m.id === sent.id)).toBe(true)

    const inbox = await listDealerMessages()
    expect(inbox).toMatchObject({ page: 1, total: expect.any(Number) })
    const unread = inbox.items.find((m) => !m.read)
    expect(unread).toBeTruthy()
    expect(await getDealerUnreadMessageCount()).toBeGreaterThan(0)

    const read = await markDealerMessageRead(unread!.id)
    expect(read.read).toBe(true)
    const archived = await moveDealerMessageToFolder(unread!.id, 'archived')
    expect(archived.folder).toBe('archived')
  })

  it('lists reviews as a page and accepts exactly one response', async () => {
    const page = await listDealerReviews()
    expect(page).toMatchObject({ page: 1, total: expect.any(Number) })
    expect(page.items[0]).toMatchObject({
      id: expect.any(String),
      rating: expect.any(Number),
      customerName: expect.any(String),
    })

    const responded = await respondToDealerReview('rev_1', 'Thanks for subscribing with us!')
    expect(responded).toMatchObject({
      id: 'rev_1',
      dealerResponse: 'Thanks for subscribing with us!',
      dealerRespondedAt: expect.any(String),
    })

    await expect(respondToDealerReview('rev_1', 'Again')).rejects.toMatchObject({
      status: 409,
      message: 'This review already has a dealer response',
    })
  })

  it('upgrades the dealer plan and raises a due invoice for it', async () => {
    const plans = await listDealerBillingPlans()
    expect(plans.map((p) => p.code)).toEqual(['starter', 'professional', 'enterprise'])

    const before = await getDealerBillingState()
    expect(before.subscription?.planCode).toBe('starter')
    expect(before.quota).toMatchObject({ used: expect.any(Number), enforced: true })

    const professional = plans.find((p) => p.code === 'professional')!
    const result = await changeDealerSubscriptionPlan(professional.id)
    expect(result.change).toBe('upgraded')
    expect(result.subscription.planCode).toBe('professional')
    expect(result.invoice).toMatchObject({ amount: 299, status: 'due' })

    const invoices = await listDealerBillingInvoices()
    expect(invoices[0]).toMatchObject({ id: result.invoice!.id, status: 'due' })

    const cancelled = await cancelDealerSubscription()
    expect(cancelled.effectiveDate).toBe(result.subscription.currentPeriodEnd)
    expect(cancelled.subscription.cancelAt).toBe(cancelled.effectiveDate)
  })

  it('serves account-security status and TOTP enrolment', async () => {
    await expect(getSecurityStatus()).resolves.toMatchObject({
      totpEnabled: expect.any(Boolean),
      totpRequired: expect.any(Boolean),
      smsVerified: expect.any(Boolean),
      smsVerificationAvailable: expect.any(Boolean),
    })
    const setup = await setup2fa()
    expect(setup).toMatchObject({ secret: expect.any(String), uri: expect.any(String) })
  })
})
