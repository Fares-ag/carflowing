import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/index.js'
import { addDays, todayISO } from '../../utils/dates.js'
import { profiles, rentals, userPreferences } from '../../db/schema.js'
import { generateDueInvoices } from '../../services/billing.js'
import { resetWhatsAppProviderCache } from '../../services/whatsapp.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

const sendWhatsAppTemplate = vi.fn()

/**
 * Billing-timezone relative date. The services compute "today" in the billing
 * timezone (utils/dates todayISO), so a UTC-based helper disagrees with them
 * between 21:00 and 24:00 UTC and shifts every derived date by a day.
 */
function daysAgo(n: number): string {
  return addDays(todayISO(), -n)
}

async function activeRentalWithBillingDue(app: Express, fixtures: Awaited<ReturnType<typeof seedFixtures>>) {
  const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
  const br = await customerAgent
    .post('/api/customer/booking-requests')
    .send({ vehicleId: fixtures.vehicles[0].id, note: JSON.stringify({ durationMonths: 3 }) })
  const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
  await dealerAgent.patch(`/api/dealer/booking-requests/${br.body.id}/status`).send({ status: 'approved' })
  const [rental] = await db.select().from(rentals)
  await dealerAgent.post('/api/dealer/payments/offline').send({ rentalId: rental.id })
  await dealerAgent.post(`/api/dealer/rentals/${rental.id}/handover`).send({})
  await db.update(rentals).set({ nextBillingDate: daysAgo(1) }).where(eq(rentals.id, rental.id))
  return rental
}

vi.mock('../../services/whatsapp.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/whatsapp.js')>()
  return {
    ...actual,
    sendWhatsAppTemplate: (...args: unknown[]) => sendWhatsAppTemplate(...args),
    isWhatsAppProviderConfigured: () => process.env.WHATSAPP_PROVIDER === 'meta',
    resolveWhatsAppProvider: () =>
      process.env.WHATSAPP_PROVIDER === 'meta' ? { name: 'meta', sendTemplate: sendWhatsAppTemplate } : null,
  }
})

/** ID: WA-01..04 — WhatsApp notification channel */
describe('WhatsApp notifications', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    delete process.env.WHATSAPP_PROVIDER
    delete process.env.WHATSAPP_META_ACCESS_TOKEN
    delete process.env.WHATSAPP_META_PHONE_NUMBER_ID
    resetWhatsAppProviderCache()
    sendWhatsAppTemplate.mockReset()
    await resetDb()
  })

  it('WA-01: whatsapp preference persists via customer API', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const patch = await agent.patch('/api/customer/preferences').send({ whatsappNotifications: true })
    expect(patch.status).toBe(200)
    expect(patch.body.whatsappNotifications).toBe(true)
    const get = await agent.get('/api/customer/preferences')
    expect(get.body.whatsappNotifications).toBe(true)
  })

  it('WA-02: invoice-due sends WhatsApp when provider configured and preference enabled', async () => {
    process.env.WHATSAPP_PROVIDER = 'meta'
    process.env.WHATSAPP_META_ACCESS_TOKEN = 'test-token'
    process.env.WHATSAPP_META_PHONE_NUMBER_ID = '12345'
    resetWhatsAppProviderCache()
    sendWhatsAppTemplate.mockResolvedValue({ ok: true, providerMessageId: 'wamid.test' })

    const fixtures = await seedFixtures()
    await db
      .update(profiles)
      .set({ phone: '+97455123456' })
      .where(eq(profiles.id, fixtures.customer.id))
    await db.insert(userPreferences).values({
      userId: fixtures.customer.id,
      whatsappNotifications: true,
    })

    await activeRentalWithBillingDue(app, fixtures)
    sendWhatsAppTemplate.mockClear()

    const count = await generateDueInvoices()
    expect(count).toBe(1)
    await vi.waitFor(() => {
      const events = sendWhatsAppTemplate.mock.calls.map((call) => (call[0] as { event: string }).event)
      expect(events).toContain('invoice_due')
    })
    const dueCall = sendWhatsAppTemplate.mock.calls.find(
      (call) => (call[0] as { event: string }).event === 'invoice_due'
    )
    expect(dueCall?.[0]).toMatchObject({ to: expect.stringContaining('97455123456') })
  })

  it('WA-03: invoice-due does not crash when provider is not configured', async () => {
    const fixtures = await seedFixtures()
    await db
      .update(profiles)
      .set({ phone: '+97455123456' })
      .where(eq(profiles.id, fixtures.customer.id))
    await db.insert(userPreferences).values({
      userId: fixtures.customer.id,
      whatsappNotifications: true,
    })

    await activeRentalWithBillingDue(app, fixtures)

    await expect(generateDueInvoices()).resolves.toBe(1)
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled()
  })

  it('WA-04: WhatsApp skipped when preference disabled even if provider configured', async () => {
    process.env.WHATSAPP_PROVIDER = 'meta'
    process.env.WHATSAPP_META_ACCESS_TOKEN = 'test-token'
    process.env.WHATSAPP_META_PHONE_NUMBER_ID = '12345'
    resetWhatsAppProviderCache()
    sendWhatsAppTemplate.mockResolvedValue({ ok: true })

    const fixtures = await seedFixtures()
    await db
      .update(profiles)
      .set({ phone: '+97455123456' })
      .where(eq(profiles.id, fixtures.customer.id))

    await activeRentalWithBillingDue(app, fixtures)

    await generateDueInvoices()
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled()
  })
})
