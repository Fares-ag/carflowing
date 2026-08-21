import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { bookingRequests, messages, rentals } from '../../db/schema.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

/** Dealer ↔ customer in-app messaging with relationship scoping */
describe('Dealer messaging API', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('allows dealer to message customer with active rental and blocks unrelated customer', async () => {
    const fixtures = await seedFixtures()
    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        status: 'active',
        monthlyAmount: '1500',
        totalAmount: '1500',
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        termMonths: 12,
      })
      .returning()

    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')

    const composed = await dealerAgent.post('/api/dealer/messages').send({
      toUserId: fixtures.customer.id,
      body: 'Your vehicle is ready for pickup.',
      rentalId: rental.id,
    })
    expect(composed.status).toBe(201)
    expect(composed.body.subject).toContain(rental.id)

    const blocked = await dealerAgent.post('/api/dealer/messages').send({
      toUserId: fixtures.customer2.id,
      body: 'Hello stranger',
      subject: 'Unrelated',
    })
    expect(blocked.status).toBe(403)

    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const inbox = await customerAgent.get('/api/customer/messages').query({ folder: 'inbox' })
    expect(inbox.status).toBe(200)
    expect(inbox.body.items.some((m: { body: string }) => m.body.includes('ready for pickup'))).toBe(true)

    const unread = await customerAgent.get('/api/customer/messages/unread-count')
    expect(unread.body.count).toBeGreaterThanOrEqual(1)

    const notifs = await customerAgent.get('/api/customer/notifications')
    expect(notifs.body.items.some((n: { title: string }) => n.title === 'New message')).toBe(true)
  })

  it('allows customer reply in same thread and dealer sees it', async () => {
    const fixtures = await seedFixtures()
    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        status: 'reserved',
        monthlyAmount: '1200',
        totalAmount: '1200',
        startDate: '2026-02-01',
        endDate: '2026-08-01',
        termMonths: 6,
      })
      .returning()

    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const first = await dealerAgent.post('/api/dealer/messages').send({
      toUserId: fixtures.customer.id,
      body: 'Please confirm pickup time.',
      rentalId: rental.id,
    })
    expect(first.status).toBe(201)

    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const reply = await customerAgent.post('/api/customer/messages').send({
      toUserId: fixtures.dealer.id,
      body: 'Pickup at 3pm works.',
      replyToMessageId: (
        await db.select().from(messages).where(eq(messages.folder, 'inbox')).limit(1)
      )[0].id,
    })
    expect(reply.status).toBe(201)

    const threads = await dealerAgent.get('/api/dealer/messages/threads')
    expect(threads.status).toBe(200)
    expect(threads.body.length).toBeGreaterThanOrEqual(1)

    const threadSubject = threads.body[0].threadSubject as string
    const thread = await dealerAgent.get('/api/dealer/messages/thread').query({ subject: threadSubject })
    expect(thread.status).toBe(200)
    expect(thread.body.some((m: { body: string }) => m.body.includes('3pm'))).toBe(true)

    const dealerUnread = await dealerAgent.get('/api/dealer/messages/unread-count')
    expect(dealerUnread.body.count).toBeGreaterThanOrEqual(1)
  })

  it('allows dealer to message via pending booking relationship', async () => {
    const fixtures = await seedFixtures()
    const [booking] = await db
      .insert(bookingRequests)
      .values({
        customerId: fixtures.customer.id,
        vehicleId: fixtures.vehicles[0].id,
        status: 'pending',
        awaitingPayment: false,
      })
      .returning()

    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const composed = await dealerAgent.post('/api/dealer/messages').send({
      toUserId: fixtures.customer.id,
      body: 'We received your booking request.',
      bookingRequestId: booking.id,
    })
    expect(composed.status).toBe(201)
    expect(composed.body.subject).toContain(booking.id)
  })
})
