import { desc, eq } from 'drizzle-orm'
import type { Express } from 'express'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/index.js'
import { bookingRequests, commissionLedger, complaints, dealers, emailOutbox, payouts } from '../../db/schema.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

describe('transactional email events', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    vi.unstubAllEnvs()
    await resetDb()
  })

  async function latestOutboxSubject(): Promise<string | undefined> {
    const [row] = await db.select().from(emailOutbox).orderBy(desc(emailOutbox.createdAt)).limit(1)
    return row?.subject
  }

  it('MAIL-EVT-01: booking decline enqueues customer email', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const fixtures = await seedFixtures()
    const [br] = await db
      .insert(bookingRequests)
      .values({ customerId: fixtures.customer.id, vehicleId: fixtures.vehicles[0].id, status: 'pending' })
      .returning()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')

    await agent
      .patch(`/api/dealer/booking-requests/${br.id}/status`)
      .send({ status: 'declined', declineReason: 'Unavailable' })

    await vi.waitFor(async () => {
      expect(await latestOutboxSubject()).toBe('Your CarFlow booking request was declined')
    })
  })

  it('MAIL-EVT-02: complaint reply enqueues customer email', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const fixtures = await seedFixtures()
    const [c] = await db
      .insert(complaints)
      .values({
        customerId: fixtures.customer.id,
        category: 'billing',
        subject: 'Wrong charge',
        description: 'I was charged twice for the same month please help',
      })
      .returning()
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    const reply = await adminAgent.post(`/api/admin/complaints/${c.id}/replies`).send({
      body: 'We have issued a credit to your account.',
    })
    expect(reply.status).toBe(201)
    await vi.waitFor(async () => {
      expect(await latestOutboxSubject()).toBe('Re: Wrong charge')
    })
  })

  it('MAIL-EVT-03: payout mark-paid enqueues dealer email', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const fixtures = await seedFixtures()
    await db
      .update(dealers)
      .set({
        bankAccountName: 'Premium Cars QA',
        bankName: 'QNB',
        bankIban: 'QA58QNBA000000000000000000001',
        bankDetailsVerifiedAt: new Date(),
      })
      .where(eq(dealers.id, fixtures.dealer.dealerId))
    await db.insert(commissionLedger).values({
      dealerId: fixtures.dealer.dealerId,
      grossAmount: '200',
      commissionRate: '0.1',
      commissionAmount: '20',
      netAmount: '180',
      status: 'pending',
    })
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    await adminAgent.post('/api/admin/payouts/generate')
    const [payout] = await db.select().from(payouts).limit(1)
    expect(payout).toBeTruthy()

    const { agent: financeAgent } = await loginAs(app, fixtures.finance.email, 'finance')
    await financeAgent.post(`/api/admin/payouts/${payout!.id}/mark-paid`)
    await vi.waitFor(async () => {
      expect(await latestOutboxSubject()).toBe('Your CarFlow payout has been sent')
    })
  })

  it('MAIL-EVT-05: attacker-controlled text is escaped before it reaches the mail provider', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_test')
    vi.stubEnv('FROM_EMAIL', 'noreply@test.dev')
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => '{}',
    } as Response)

    const payload =
      '<a href="https://evil.example/phish">click & "win"</a> <script>alert(1)</script>'
    const { sendBookingDeclinedEmail, sendStaffInviteEmail } = await import('../mail.js')
    await sendBookingDeclinedEmail({
      to: 'victim@test.dev',
      customerName: payload,
      vehicleName: payload,
      declineReason: payload,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const { html } = JSON.parse(String(init.body)) as { html: string }
    expect(html).not.toContain('<a href="https://evil.example/phish">')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;a href=&quot;https://evil.example/phish&quot;&gt;')
    expect(html).toContain('click &amp; &quot;win&quot;')
    expect(html).toContain('&lt;script&gt;')

    // A javascript: invite URL never becomes a live href either.
    fetchMock.mockClear()
    await sendStaffInviteEmail({
      to: 'staff@test.dev',
      name: 'Ops',
      role: 'ops',
      // eslint-disable-next-line no-script-url
      inviteUrl: 'javascript:alert(1)',
    })
    const [, inviteInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    const invite = JSON.parse(String(inviteInit.body)) as { html: string }
    expect(invite.html).toContain('<a href="#">')
    expect(invite.html).not.toContain('javascript:')
    fetchMock.mockRestore()
  })

  it('MAIL-EVT-04: customer suspension enqueues account email', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const fixtures = await seedFixtures()
    const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
    await adminAgent
      .patch(`/api/admin/customers/${fixtures.customer.id}/status`)
      .send({ status: 'suspended' })
    await vi.waitFor(async () => {
      expect(await latestOutboxSubject()).toBe('Your CarFlow account has been suspended')
    })
  })
})
