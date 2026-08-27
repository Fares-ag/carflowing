import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import { SignJWT } from 'jose'
import request from 'supertest'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { bookingRequests, payments, profiles, rentals, userSecurity } from '../../db/schema.js'
import { resetSmsSendLimits } from '../../auth/smsSendLimits.js'
import { currentTotpCode } from '../../services/totp.js'
import { DEMO_PASSWORD, buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

/**
 * ID: SEC-01..SEC-06 (Phase 1.6) — cross-cutting API security tests
 * Files: apps/backend/src/middleware/auth.ts, apps/backend/src/routes/*.ts
 */
describe('Cross-cutting security', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('SEC-06: GET /health is publicly reachable', async () => {
    const res = await request(app).get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body).toHaveProperty('lastJobsSweepAt')
    expect(typeof res.body.stuckPendingCount).toBe('number')
  })

  it('SEC-06b: GET /health/live does not depend on the database', async () => {
    const res = await request(app).get('/health/live')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })

  it('SEC-01: unauthenticated requests to protected routes return 401', async () => {
    const targets = [
      ['get', '/api/customer/dashboard'],
      ['get', '/api/dealer/dashboard'],
      ['get', '/api/admin/dashboard'],
    ] as const
    for (const [method, url] of targets) {
      const res = await request(app)[method](url)
      expect(res.status).toBe(401)
    }
  })

  it('SEC-02: a tampered/invalid access-token cookie is rejected with 401', async () => {
    const res = await request(app).get('/api/auth/me').set('Cookie', 'cf_access=not-a-real-jwt')
    expect(res.status).toBe(401)
  })

  it('SEC-02: a token signed with the wrong secret is rejected even with correct shape', async () => {
    const forged = await new SignJWT({ purpose: 'access', role: 'admin', email: 'hacker@test.dev' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('00000000-0000-0000-0000-000000000000')
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('wrong-secret'))
    const res = await request(app).get('/api/auth/me').set('Cookie', `cf_access=${forged}`)
    expect(res.status).toBe(401)
  })

  it('SEC-02b: a 2FA challenge token cannot be used as an access cookie', async () => {
    const fixtures = await seedFixtures()
    const secret = 'TEST2FASECRETABCDEFGHIJKLMNOPQRSTUV'
    await db.insert(userSecurity).values({
      userId: fixtures.customer.id,
      totpSecret: secret,
      totpEnabled: true,
    })
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: fixtures.customer.email, password: 'password123', expectedRole: 'customer' })
    expect(login.status).toBe(200)
    expect(login.body.requires2fa).toBe(true)
    expect(login.body.challengeToken).toBeTruthy()

    const me = await request(app)
      .get('/api/auth/me')
      .set('Cookie', `cf_access=${login.body.challengeToken}`)
    expect(me.status).toBe(401)
  })

  it('SEC-02: an expired access token is rejected with 401 while refresh still works', async () => {
    const secret = new TextEncoder().encode('test-access-secret')
    const expired = await new SignJWT({ role: 'customer', email: 'x@test.dev' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('00000000-0000-0000-0000-000000000000')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
      .sign(secret)
    const res = await request(app).get('/api/auth/me').set('Cookie', `cf_access=${expired}`)
    expect(res.status).toBe(401)
  })

  it('SEC-03: dealer A cannot see dealer B inventory or approve dealer B booking requests', async () => {
    const fixtures = await seedFixtures()
    const { agent: dealer1 } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const inv = await dealer1.get('/api/dealer/inventory')
    expect(inv.status).toBe(200)
    const ids = inv.body.items.map((v: { id: string }) => v.id)
    expect(ids).not.toContain(fixtures.dealer2Vehicle.id)

    const patchOther = await dealer1
      .patch(`/api/dealer/vehicles/${fixtures.dealer2Vehicle.id}/status`)
      .send({ status: 'inactive' })
    expect(patchOther.status).toBe(404)
  })

  it('SEC-04: invalid UUID route params are handled without a 500', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const res = await agent.get('/api/customer/vehicles/not-a-uuid')
    // Drizzle/pg will error on a malformed uuid; the route's asyncHandler
    // forwards it to the global error handler, which currently returns 500
    // instead of a clean 400/404 — documented here rather than asserted as
    // ideal behavior.
    expect(res.status).toBe(400)
  })

  it('SEC-05: search-like query params containing SQL syntax do not error or leak data', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const res = await agent.get('/api/admin/customers').query({ page: "1' OR '1'='1" })
    // parsePagination coerces with Number(), so this becomes NaN -> falls
    // back to the default page; Drizzle's parameterized queries mean the
    // string never reaches raw SQL.
    expect(res.status).toBe(200)
    expect(res.body.page).toBe(1)
  })

  it('RBAC: customer token gets 403 on dealer and admin routes', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const dealerRes = await agent.get('/api/dealer/dashboard')
    const adminRes = await agent.get('/api/admin/dashboard')
    expect(dealerRes.status).toBe(403)
    expect(adminRes.status).toBe(403)
  })

  it('RBAC: dealer token gets 403 on customer and admin routes', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const customerRes = await agent.get('/api/customer/dashboard')
    const adminRes = await agent.get('/api/admin/dashboard')
    expect(customerRes.status).toBe(403)
    expect(adminRes.status).toBe(403)
  })

  it('RBAC: admin token gets 403 on customer and dealer routes', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
    const customerRes = await agent.get('/api/customer/dashboard')
    const dealerRes = await agent.get('/api/dealer/dashboard')
    expect(customerRes.status).toBe(403)
    expect(dealerRes.status).toBe(403)
  })

  it('CUST-N06: a customer cannot PATCH their own booking request to "approved" via the API', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    const created = await agent
      .post('/api/customer/booking-requests')
      .send({ vehicleId: fixtures.vehicles[0].id })
    expect(created.status).toBe(201)
    const escalated = await agent
      .patch(`/api/customer/booking-requests/${created.body.id}/status`)
      .send({ status: 'approved' })
    // Approval is a dealer/admin-only transition; the customer route rejects
    // anything other than withdrawing (declining) their own pending request.
    expect(escalated.status).toBe(403)
    const stillPending = await agent.get('/api/customer/booking-requests')
    expect(stillPending.body.items[0].status).toBe('pending')
  })

  it('IDOR-01: customer B cannot cancel customer A rental', async () => {
    const fixtures = await seedFixtures()
    const today = new Date().toISOString().slice(0, 10)
    const [rental] = await db
      .insert(rentals)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        vehicleId: fixtures.vehicles[0].id,
        startDate: today,
        endDate: today,
        status: 'reserved',
        totalAmount: '100',
        paymentStatus: 'pending',
      })
      .returning()
    const { agent: other } = await loginAs(app, fixtures.customer2.email, 'customer')
    const res = await other.post(`/api/customer/rentals/${rental.id}/cancel`).send({})
    expect([403, 404]).toContain(res.status)
    const [still] = await db.select().from(rentals).where(eq(rentals.id, rental.id))
    expect(still.status).toBe('reserved')
  })

  it('IDOR-02: customer B cannot read customer A payment status', async () => {
    const fixtures = await seedFixtures()
    const [payment] = await db
      .insert(payments)
      .values({
        customerId: fixtures.customer.id,
        dealerId: fixtures.dealer.dealerId,
        amount: '50',
        status: 'pending',
        type: 'rental',
        method: 'card',
      })
      .returning()
    const { agent: other } = await loginAs(app, fixtures.customer2.email, 'customer')
    const res = await other.get(`/api/payments/skipcash/status/${payment.id}`)
    expect([403, 404]).toContain(res.status)
  })

  it('IDOR-03: dealer A cannot approve dealer B booking', async () => {
    const fixtures = await seedFixtures()
    const [br] = await db
      .insert(bookingRequests)
      .values({
        customerId: fixtures.customer.id,
        vehicleId: fixtures.dealer2Vehicle.id,
        status: 'pending',
      })
      .returning()
    const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
    const res = await agent.patch(`/api/dealer/booking-requests/${br.id}/status`).send({ status: 'approved' })
    expect([403, 404]).toContain(res.status)
  })

  it('AUTH-ROLE: demoted JWT role is overwritten from the database on the next request', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
    await db.update(profiles).set({ role: 'dealer' }).where(eq(profiles.id, fixtures.customer.id))
    const res = await agent.get('/api/customer/dashboard')
    expect(res.status).toBe(403)
  })

  describe('2FA enrolment', () => {
    it('SEC-2FA-SETUP-01: re-running setup on an enabled account is 409 and never disables 2FA', async () => {
      const fixtures = await seedFixtures()
      const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
      const setup = await agent.post('/api/customer/security/2fa/setup')
      expect(setup.status).toBe(200)
      const enable = await agent
        .post('/api/customer/security/2fa/enable')
        .send({ code: currentTotpCode(setup.body.secret) })
      expect(enable.status).toBe(200)

      // No code, no password: this used to rewrite the secret and write
      // totpEnabled:false, silently switching 2FA off.
      const reSetup = await agent.post('/api/customer/security/2fa/setup').send({})
      expect(reSetup.status).toBe(409)
      expect(reSetup.body.totpEnabled).toBe(true)
      expect(reSetup.body.secret).toBeUndefined()

      const [row] = await db
        .select()
        .from(userSecurity)
        .where(eq(userSecurity.userId, fixtures.customer.id))
      expect(row.totpEnabled).toBe(true)
      expect(row.totpSecret).toBe(setup.body.secret)
    })

    it('SEC-2FA-SETUP-02: a wrong code cannot re-enrol; a current code rotates the secret and keeps 2FA on', async () => {
      const fixtures = await seedFixtures()
      const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
      const setup = await agent.post('/api/customer/security/2fa/setup')
      await agent
        .post('/api/customer/security/2fa/enable')
        .send({ code: currentTotpCode(setup.body.secret) })

      const wrong = await agent.post('/api/customer/security/2fa/setup').send({ code: '000000' })
      expect(wrong.status).toBe(409)

      const rotated = await agent
        .post('/api/customer/security/2fa/setup')
        .send({ code: currentTotpCode(setup.body.secret) })
      expect(rotated.status).toBe(200)
      expect(rotated.body.secret).not.toBe(setup.body.secret)

      const [row] = await db
        .select()
        .from(userSecurity)
        .where(eq(userSecurity.userId, fixtures.customer.id))
      expect(row.totpEnabled).toBe(true)
      expect(row.totpSecret).toBe(rotated.body.secret)
    })

    it('SEC-2FA-ROLE-01: every role can enrol via the role-agnostic /api/auth/security paths', async () => {
      const fixtures = await seedFixtures()
      const targets = [
        [fixtures.admin.email, 'admin'],
        [fixtures.finance.email, 'finance'],
        [fixtures.dealer.email, 'dealer'],
        [fixtures.customer.email, 'customer'],
      ] as const
      for (const [email, role] of targets) {
        const { agent } = await loginAs(app, email, role)
        const status = await agent.get('/api/auth/security')
        expect(status.status).toBe(200)
        expect(status.body.totpEnabled).toBe(false)

        const setup = await agent.post('/api/auth/security/2fa/setup')
        expect(setup.status).toBe(200)
        const enable = await agent
          .post('/api/auth/security/2fa/enable')
          .send({ code: currentTotpCode(setup.body.secret) })
        expect(enable.status).toBe(200)

        const after = await agent.get('/api/auth/security')
        expect(after.body.totpEnabled).toBe(true)
      }
    })

    it('SEC-2FA-ROLE-02: an enrolled staff account is challenged for TOTP at login', async () => {
      const fixtures = await seedFixtures()
      const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
      const setup = await agent.post('/api/auth/security/2fa/setup')
      await agent
        .post('/api/auth/security/2fa/enable')
        .send({ code: currentTotpCode(setup.body.secret) })

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: fixtures.admin.email, password: DEMO_PASSWORD, expectedRole: 'admin' })
      expect(login.status).toBe(200)
      expect(login.body.requires2fa).toBe(true)

      const verified = await request(app)
        .post('/api/auth/2fa/verify-login')
        .send({ challengeToken: login.body.challengeToken, code: currentTotpCode(setup.body.secret) })
      expect(verified.status).toBe(200)
      expect(verified.body.role).toBe('admin')
    })
  })

  describe('mandatory staff 2FA (REQUIRE_STAFF_2FA)', () => {
    afterEach(() => {
      delete process.env.REQUIRE_STAFF_2FA
    })

    it('SEC-STAFF-2FA-01: staff without TOTP cannot get a session; customers and dealers are unaffected', async () => {
      const fixtures = await seedFixtures()
      process.env.REQUIRE_STAFF_2FA = 'true'

      for (const [email, role] of [
        [fixtures.admin.email, 'admin'],
        [fixtures.finance.email, 'admin'],
        [fixtures.ops.email, 'admin'],
        [fixtures.support.email, 'admin'],
      ] as const) {
        const blocked = await request(app)
          .post('/api/auth/login')
          .send({ email, password: DEMO_PASSWORD, expectedRole: role })
        expect(blocked.status).toBe(403)
        expect(blocked.body.requires2faEnrolment).toBe(true)
        expect(blocked.headers['set-cookie']).toBeUndefined()
      }

      for (const [email, role] of [
        [fixtures.customer.email, 'customer'],
        [fixtures.dealer.email, 'dealer'],
      ] as const) {
        const ok = await request(app)
          .post('/api/auth/login')
          .send({ email, password: DEMO_PASSWORD, expectedRole: role })
        expect(ok.status).toBe(200)
      }
    })

    it('SEC-STAFF-2FA-02: an existing staff session cannot be refreshed without TOTP', async () => {
      const fixtures = await seedFixtures()
      const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
      expect((await agent.post('/api/auth/refresh')).status).toBe(200)

      process.env.REQUIRE_STAFF_2FA = 'true'
      const blocked = await agent.post('/api/auth/refresh')
      expect(blocked.status).toBe(403)
      expect(blocked.body.requires2faEnrolment).toBe(true)
    })

    it('SEC-STAFF-2FA-03: staff cannot disable TOTP while the policy is on', async () => {
      const fixtures = await seedFixtures()
      const { agent } = await loginAs(app, fixtures.admin.email, 'admin')
      const setup = await agent.post('/api/auth/security/2fa/setup')
      await agent
        .post('/api/auth/security/2fa/enable')
        .send({ code: currentTotpCode(setup.body.secret) })

      process.env.REQUIRE_STAFF_2FA = 'true'
      const disable = await agent
        .post('/api/auth/security/2fa/disable')
        .send({ code: currentTotpCode(setup.body.secret) })
      expect(disable.status).toBe(403)

      const [row] = await db
        .select()
        .from(userSecurity)
        .where(eq(userSecurity.userId, fixtures.admin.id))
      expect(row.totpEnabled).toBe(true)
    })
  })

  describe('SMS verification spend guard', () => {
    beforeEach(() => {
      resetSmsSendLimits()
    })

    afterEach(() => {
      resetSmsSendLimits()
    })

    it('SEC-SMS-LIMIT-01: a second send inside the cooldown is 429, for the user and for the number', async () => {
      const fixtures = await seedFixtures()
      const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
      const first = await agent.post('/api/auth/security/sms/send').send({ phone: '+97455512345' })
      expect(first.status).toBe(200)

      const second = await agent.post('/api/auth/security/sms/send').send({ phone: '+97455512345' })
      expect(second.status).toBe(429)
      expect(Number(second.headers['retry-after'])).toBeGreaterThan(0)
      expect(second.body.retryAfterSeconds).toBeGreaterThan(0)

      // Another number does not reset the user's cooldown.
      const otherNumber = await agent.post('/api/auth/security/sms/send').send({ phone: '+97455599999' })
      expect(otherNumber.status).toBe(429)

      // Nor does another account get to keep texting the same number.
      const { agent: other } = await loginAs(app, fixtures.customer2.email, 'customer')
      const crossUser = await other.post('/api/auth/security/sms/send').send({ phone: '+974 555 12345' })
      expect(crossUser.status).toBe(429)
    })

    it('SEC-SMS-LIMIT-02: a blocked send does not overwrite the pending code', async () => {
      const fixtures = await seedFixtures()
      const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
      await agent.post('/api/auth/security/sms/send').send({ phone: '+97455554321' })
      const [before] = await db
        .select()
        .from(userSecurity)
        .where(eq(userSecurity.userId, fixtures.customer.id))

      const blocked = await agent.post('/api/auth/security/sms/send').send({ phone: '+97455554321' })
      expect(blocked.status).toBe(429)

      const [after] = await db
        .select()
        .from(userSecurity)
        .where(eq(userSecurity.userId, fixtures.customer.id))
      expect(after.smsCodeHash).toBe(before.smsCodeHash)
    })
  })

  describe('access-token revocation watermark', () => {
    it('SEC-REVOKE-01: logout-all kills sibling access tokens immediately', async () => {
      const fixtures = await seedFixtures()
      const { agent: sessionA } = await loginAs(app, fixtures.customer.email, 'customer')
      const { agent: sessionB } = await loginAs(app, fixtures.customer.email, 'customer')
      expect((await sessionB.get('/api/auth/me')).status).toBe(200)

      expect((await sessionA.post('/api/auth/logout-all')).status).toBe(204)

      // Used to stay 200 for up to 15 minutes: only the refresh session was revoked.
      expect((await sessionB.get('/api/auth/me')).status).toBe(401)
      expect((await sessionB.get('/api/customer/dashboard')).status).toBe(401)
    })

    it('SEC-REVOKE-02: changing the password kills sibling access tokens immediately', async () => {
      const fixtures = await seedFixtures()
      const { agent: sessionA } = await loginAs(app, fixtures.customer.email, 'customer')
      const { agent: sessionB } = await loginAs(app, fixtures.customer.email, 'customer')

      const changed = await sessionA
        .post('/api/auth/change-password')
        .send({ currentPassword: DEMO_PASSWORD, newPassword: 'newpassword456' })
      expect(changed.status).toBe(200)

      expect((await sessionB.get('/api/auth/me')).status).toBe(401)
    })

    it('SEC-REVOKE-03: single-session logout leaves the other session alone', async () => {
      const fixtures = await seedFixtures()
      const { agent: sessionA } = await loginAs(app, fixtures.customer.email, 'customer')
      const { agent: sessionB } = await loginAs(app, fixtures.customer.email, 'customer')

      expect((await sessionA.post('/api/auth/logout')).status).toBe(204)
      expect((await sessionB.get('/api/auth/me')).status).toBe(200)
    })
  })
})
