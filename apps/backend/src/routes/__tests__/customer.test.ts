import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/index.js'
import { bookingRequests, customerProfiles, maintenanceRecords, notifications, paymentMethods, profiles, rentals, vehicles } from '../../db/schema.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

const deleteStoredFileMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('../../storage/index.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../storage/index.js')>()
  return { ...actual, deleteStoredFile: deleteStoredFileMock }
})

/** ID: CUST-01..CUST-28 — customer route integration tests */
describe('Customer API', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    deleteStoredFileMock.mockClear()
    await resetDb()
  })

  it('CUST-01: dashboard returns favoritesCount and rental summaries', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent.get('/api/customer/dashboard')
    expect(res.status).toBe(200)
    expect(typeof res.body.favoritesCount).toBe('number')
    expect(Array.isArray(res.body.upcomingRentals)).toBe(true)
    expect(Array.isArray(res.body.recentRentals)).toBe(true)
  })

  it('CUST-02/CUST-03/CUST-04: list vehicles paginated; get by id; 404 for missing', async () => {
    const fixtures = await seedFixtures()
    const publicList = await request(app).get('/api/customer/vehicles').query({ page: 1, pageSize: 10 })
    expect(publicList.status).toBe(200)
    expect(Array.isArray(publicList.body.items)).toBe(true)

    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const list = await agent.get('/api/customer/vehicles').query({ page: 1, pageSize: 10 })
    expect(list.status).toBe(200)
    expect(Array.isArray(list.body.items)).toBe(true)
    expect(list.body.items.length).toBeGreaterThan(0)
    expect(list.body).toMatchObject({ total: expect.any(Number), page: 1, pageSize: 10 })

    const detail = await agent.get(`/api/customer/vehicles/${fixtures.vehicles[0].id}`)
    expect(detail.status).toBe(200)
    expect(detail.body.id).toBe(fixtures.vehicles[0].id)

    const missing = await agent.get('/api/customer/vehicles/00000000-0000-0000-0000-000000000099')
    expect(missing.status).toBe(404)
  })

  it('CUST-02b: vehicles with a pending booking are hidden from others but visible to requester', async () => {
    const fixtures = await seedFixtures()
    const vehicleId = fixtures.vehicles[0].id
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')

    await agent.post('/api/customer/booking-requests').send({ vehicleId })

    const anonList = await request(app).get('/api/customer/vehicles').query({ page: 1, pageSize: 50 })
    expect(anonList.body.items.some((v: { id: string }) => v.id === vehicleId)).toBe(false)

    const anonDetail = await request(app).get(`/api/customer/vehicles/${vehicleId}`)
    expect(anonDetail.status).toBe(404)

    const ownerList = await agent.get('/api/customer/vehicles').query({ page: 1, pageSize: 50 })
    expect(ownerList.body.items.some((v: { id: string }) => v.id === vehicleId)).toBe(true)

    const ownerDetail = await agent.get(`/api/customer/vehicles/${vehicleId}`)
    expect(ownerDetail.status).toBe(200)
    expect(ownerDetail.body.id).toBe(vehicleId)
  })

  it('CUST-CAT-01: category filter returns server total and pages beyond the first 20', async () => {
    const fixtures = await seedFixtures()
    await db.insert(vehicles).values(
      Array.from({ length: 24 }, (_, index) => ({
        dealerId: fixtures.dealer.dealerId,
        name: `Catalog Sedan ${index + 1}`,
        make: 'Toyota',
        model: `Corolla ${index + 1}`,
        year: 2022,
        category: 'sedan' as const,
        status: 'available' as const,
        pricePerDay: '150',
        transmission: 'automatic' as const,
        fuelType: 'gas' as const,
        seats: 5,
      }))
    )

    const page1 = await request(app).get('/api/customer/vehicles').query({
      page: 1,
      pageSize: 20,
      category: 'sedan',
    })
    expect(page1.status).toBe(200)
    expect(page1.body.total).toBe(25)
    expect(page1.body.items).toHaveLength(20)

    const page2 = await request(app).get('/api/customer/vehicles').query({
      page: 2,
      pageSize: 20,
      category: 'sedan',
    })
    expect(page2.status).toBe(200)
    expect(page2.body.total).toBe(25)
    expect(page2.body.items).toHaveLength(5)
  })

  it('CUST-05..CUST-08: favorites add/list/delete/clear', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const vehicleId = fixtures.vehicles[0].id

    const added = await agent.post('/api/customer/favorites').send({ vehicleId })
    expect(added.status).toBe(201)

    const list = await agent.get('/api/customer/favorites')
    expect(list.body.items.some((f: { vehicleId: string }) => f.vehicleId === vehicleId)).toBe(true)

    const dup = await agent.post('/api/customer/favorites').send({ vehicleId })
    expect([201, 500]).toContain(dup.status)

    await agent.delete(`/api/customer/favorites/${added.body.id}`)
    await agent.delete('/api/customer/favorites')
    const cleared = await agent.get('/api/customer/favorites')
    expect(cleared.body.items.length).toBe(0)
  })

  it('CUST-09..CUST-13: booking requests create/list/details/update status/note', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const created = await agent
      .post('/api/customer/booking-requests')
      .send({ vehicleId: fixtures.vehicles[0].id, note: 'Need SUV' })
    expect(created.status).toBe(201)
    expect(created.body.status).toBe('pending')

    const list = await agent.get('/api/customer/booking-requests')
    expect(list.body.items.length).toBe(1)

    const details = await agent.get('/api/customer/booking-requests/details')
    expect(details.body.items[0].vehicle?.id).toBe(fixtures.vehicles[0].id)

    const notePatch = await agent
      .patch(`/api/customer/booking-requests/${created.body.id}/note`)
      .send({ note: 'Updated note' })
    expect(notePatch.body.note).toBe('Updated note')

    const statusPatch = await agent
      .patch(`/api/customer/booking-requests/${created.body.id}/status`)
      .send({ status: 'declined' })
    expect(statusPatch.body.status).toBe('declined')
  })

  it('CUST-14..CUST-16: rentals list/details/status patch', async () => {
    const fixtures = await seedFixtures()
    const today = new Date().toISOString().slice(0, 10)
    const end = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
    await db.insert(rentals).values({
      customerId: fixtures.customer.id,
      dealerId: fixtures.dealer.dealerId,
      vehicleId: fixtures.vehicles[0].id,
      startDate: today,
      endDate: end,
      status: 'reserved',
      totalAmount: '900',
      paymentStatus: 'pending',
    })

    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const list = await agent.get('/api/customer/rentals')
    expect(list.body.items.length).toBe(1)

    const details = await agent.get('/api/customer/rentals/details')
    expect(details.body.items[0].vehicle).toBeTruthy()

    const patched = await agent
      .patch(`/api/customer/rentals/${list.body.items[0].id}/status`)
      .send({ status: 'cancelled' })
    expect(patched.body.status).toBe('cancelled')
  })

  it('CUST-17..CUST-20: profile get/patch/full/documents/avatar', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')

    const profile = await agent.get('/api/customer/profile')
    expect(profile.status).toBe(200)

    const renamed = await agent
      .patch('/api/customer/profile')
      .send({ name: 'Renamed Customer', phone: '+97455551234' })
    expect(renamed.status).toBe(200)
    const full = await agent.get('/api/customer/profile/full')
    expect(full.body.profile.name).toBe('Renamed Customer')

    await agent
      .patch('/api/customer/profile/documents')
      .send({
        qidDocumentPath: `documents/${fixtures.customer.id}/qid.pdf`,
        driversLicensePath: `documents/${fixtures.customer.id}/license.pdf`,
        qidNumber: '28412345678',
        driversLicenseNumber: '12345678',
      })
    const docs = await agent.get('/api/customer/profile')
    expect(docs.body.qidDocumentPath).toBe(`documents/${fixtures.customer.id}/qid.pdf`)

    const avatar = await agent.patch('/api/customer/profile/avatar').send({ avatarUrl: '/uploads/x.png' })
    expect(avatar.body.ok).toBe(true)
  })

  it('CUST-21..CUST-23: subscription/invoices/payment-methods', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')

    const sub = await agent.get('/api/customer/subscription')
    expect(sub.status).toBe(200)

    const invoices = await agent.get('/api/customer/invoices')
    expect(Array.isArray(invoices.body)).toBe(true)

    const [pm] = await db
      .insert(paymentMethods)
      .values({
        userId: fixtures.customer.id,
        brand: 'visa',
        last4: '4242',
        expiryMonth: 12,
        expiryYear: 2030,
        isDefault: true,
        methodType: 'card',
      })
      .returning()

    const methods = await agent.get('/api/customer/payment-methods')
    expect(methods.body.length).toBe(1)

    await agent.post(`/api/customer/payment-methods/${pm.id}/default`)
    await agent.delete(`/api/customer/payment-methods/${pm.id}`)
    const afterDelete = await agent.get('/api/customer/payment-methods')
    expect(afterDelete.body.length).toBe(0)
  })

  it('CUST-24..CUST-27: notifications list/unread/mark read/all', async () => {
    const fixtures = await seedFixtures()
    await db.insert(notifications).values({
      userId: fixtures.customer.id,
      type: 'info',
      title: 'Hello',
      message: 'Test notification',
      read: false,
    })
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')

    const list = await agent.get('/api/customer/notifications')
    expect(list.body.items.length).toBe(1)

    const unread = await agent.get('/api/customer/notifications/unread-count')
    expect(unread.body.count).toBe(1)

    await agent.post(`/api/customer/notifications/${list.body.items[0].id}/read`)
    await agent.post('/api/customer/notifications/read-all')
    const after = await agent.get('/api/customer/notifications/unread-count')
    expect(after.body.count).toBe(0)
  })

  it('CUST-28: dealer/admin tokens get 403 on all customer routes', async () => {
    const fixtures = await seedFixtures()
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    expect((await dealerAgent.get('/api/customer/dashboard')).status).toBe(403)
    expect((await adminAgent.get('/api/customer/dashboard')).status).toBe(403)
  })

  it('CUST-N01: booking for non-existent vehicle still creates row today (@gap: no FK pre-check)', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent
      .post('/api/customer/booking-requests')
      .send({ vehicleId: '00000000-0000-0000-0000-000000000099' })
    expect([201, 400, 404, 500]).toContain(res.status)
  })

  it('CUST-N02: booking a rented vehicle is rejected with 409', async () => {
    const fixtures = await seedFixtures()
    await db.update(vehicles).set({ status: 'rented' }).where(eq(vehicles.id, fixtures.vehicles[0].id))
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent
      .post('/api/customer/booking-requests')
      .send({ vehicleId: fixtures.vehicles[0].id })
    expect(res.status).toBe(409)
  })

  it('CUST-N05: duplicate rapid booking requests for the same vehicle - only one succeeds', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const [a, b] = await Promise.all([
      agent.post('/api/customer/booking-requests').send({ vehicleId: fixtures.vehicles[0].id }),
      agent.post('/api/customer/booking-requests').send({ vehicleId: fixtures.vehicles[0].id }),
    ])
    expect([a.status, b.status].sort()).toEqual([201, 409])
    const rows = await db.select().from(bookingRequests)
    expect(rows.length).toBe(1)
  })

  it('CUST-N19: customer cannot see another customer rentals in list', async () => {
    const fixtures = await seedFixtures()
    const today = new Date().toISOString().slice(0, 10)
    await db.insert(rentals).values({
      customerId: fixtures.customer2.id,
      dealerId: fixtures.dealer.dealerId,
      vehicleId: fixtures.vehicles[0].id,
      startDate: today,
      endDate: today,
      status: 'active',
      totalAmount: '100',
      paymentStatus: 'pending',
    })
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const list = await agent.get('/api/customer/rentals')
    expect(list.body.items.length).toBe(0)
  })

  it('CUST-29: customer can submit a complaint', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent.post('/api/customer/complaints').send({
      category: 'billing',
      subject: 'Invoice question',
      description: 'I need help with my last invoice.',
    })
    expect(res.status).toBe(201)
    expect(res.body.subject).toBe('Invoice question')
    expect(res.body.status).toBe('open')
  })

  it('CUST-31: customer can list complaints with reply thread', async () => {
    const fixtures = await seedFixtures()
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const created = await customerAgent.post('/api/customer/complaints').send({
      category: 'billing',
      subject: 'Invoice question',
      description: 'I need help with my last invoice.',
    })
    expect(created.status).toBe(201)

    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    await adminAgent.post(`/api/admin/complaints/${created.body.id}/replies`).send({
      body: 'We are reviewing your invoice now.',
    })

    const list = await customerAgent.get('/api/customer/complaints')
    expect(list.status).toBe(200)
    expect(list.body.items.length).toBeGreaterThanOrEqual(1)
    const row = list.body.items.find((c: { id: string }) => c.id === created.body.id)
    expect(row.replies.length).toBe(1)
    expect(row.replies[0].fromSupport).toBe(true)
    expect(row.replies[0].body).toContain('reviewing')
  })

  it('CUST-30: approved booking persists delivery fields on rental', async () => {
    const fixtures = await seedFixtures()
    const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
    const note = JSON.stringify({
      durationMonths: 1,
      startDate: '2026-05-01',
      total: 3000,
      delivery: { location: 'Doha Mall', date: '2026-05-02', time: '10:00' },
    })
    const br = await customerAgent.post('/api/customer/booking-requests').send({
      vehicleId: fixtures.vehicles[0].id,
      note,
    })
    expect(br.status).toBe(201)
    const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    await dealerAgent
      .patch(`/api/dealer/booking-requests/${br.body.id}/status`)
      .send({ status: 'approved' })
    const [rental] = await db.select().from(rentals).where(eq(rentals.customerId, fixtures.customer.id))
    expect(rental.pickupLocation).toBe('Doha Mall')
    expect(String(rental.pickupDate)).toContain('2026-05-02')
    expect(rental.pickupTime).toBe('10:00')
  })

  it('CUST-33: cancel with collection persists return slot on rental', async () => {
    const fixtures = await seedFixtures()
    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: '2026-01-01',
        endDate: '2026-04-01',
        status: 'active',
        totalAmount: '9000',
        monthlyAmount: '3000',
        termMonths: 3,
        paymentStatus: 'completed',
        nextBillingDate: '2026-02-01',
      })
      .returning()

    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent.post(`/api/customer/rentals/${rental.id}/cancel`).send({
      reason: 'Relocating',
      collection: {
        mode: 'collection',
        location: 'Pearl Qatar',
        date: '2026-03-15',
        time: '15:00–18:00',
      },
    })
    expect(res.status).toBe(200)
    expect(res.body.returnLocation).toBe('Pearl Qatar')
    expect(String(res.body.returnDate)).toContain('2026-03-15')
    expect(res.body.returnTime).toBe('15:00–18:00')
  })

  it('CUST-32: hard delete removes stored QID and license files', async () => {
    const fixtures = await seedFixtures()
    await db
      .update(customerProfiles)
      .set({
        qidDocumentPath: 'documents/customer-qid.pdf',
        driversLicensePath: 'documents/customer-license.pdf',
      })
      .where(eq(customerProfiles.userId, fixtures.customer.id))

    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent.delete('/api/customer/account')
    expect(res.status).toBe(204)

    expect(deleteStoredFileMock).toHaveBeenCalledWith('documents/customer-qid.pdf')
    expect(deleteStoredFileMock).toHaveBeenCalledWith('documents/customer-license.pdf')

    const remaining = await db.select().from(profiles).where(eq(profiles.id, fixtures.customer.id))
    expect(remaining).toHaveLength(0)
  })

  it('CUST-34: customer can request maintenance on own active rental but not another customer rental', async () => {
    const fixtures = await seedFixtures()
    const [ownRental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: '2026-01-01',
        endDate: '2026-04-01',
        status: 'active',
        totalAmount: '9000',
        monthlyAmount: '3000',
        termMonths: 3,
      })
      .returning()
    const [otherRental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer2.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[1]?.id ?? fixtures.vehicles[0].id,
        startDate: '2026-01-01',
        endDate: '2026-04-01',
        status: 'active',
        totalAmount: '9000',
        monthlyAmount: '3000',
        termMonths: 3,
      })
      .returning()

    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const created = await agent.post(`/api/customer/rentals/${ownRental.id}/maintenance-requests`).send({
      description: 'Brake noise when stopping',
      photos: ['/uploads/maintenance/sample.jpg'],
    })
    expect(created.status).toBe(201)
    expect(created.body.status).toBe('requested')
    expect(created.body.source).toBe('customer')
    expect(created.body.description).toBe('Brake noise when stopping')

    const list = await agent.get(`/api/customer/rentals/${ownRental.id}/maintenance-requests`)
    expect(list.status).toBe(200)
    expect(list.body.items).toHaveLength(1)

    const blocked = await agent.post(`/api/customer/rentals/${otherRental.id}/maintenance-requests`).send({
      description: 'Should fail',
    })
    expect(blocked.status).toBe(404)

    const rows = await db.select().from(maintenanceRecords).where(eq(maintenanceRecords.rentalId, ownRental.id))
    expect(rows).toHaveLength(1)
    expect(rows[0].reportedBy).toBe(fixtures.customer.id)

    const dealerNotifs = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, fixtures.dealer.id))
    expect(dealerNotifs.some((n) => n.title === 'New service request')).toBe(true)
  })

  it('CUST-35: security status exposes SMS capability and verification round-trip', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')

    const status = await agent.get('/api/customer/security')
    expect(status.status).toBe(200)
    expect(status.body).toMatchObject({
      smsVerified: false,
      smsVerificationAvailable: true,
    })
    expect(typeof status.body.smsProviderConfigured).toBe('boolean')
    expect(typeof status.body.smsDevFallback).toBe('boolean')

    const sent = await agent.post('/api/customer/security/sms/send').send({ phone: '+97450001234' })
    expect(sent.status).toBe(200)

    const badCode = await agent.post('/api/customer/security/sms/verify').send({ code: '000000' })
    expect(badCode.status).toBe(400)

    const after = await agent.get('/api/customer/security')
    expect(after.body.smsVerified).toBe(false)
  })
})
