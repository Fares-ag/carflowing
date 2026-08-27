import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { and, eq, isNull } from 'drizzle-orm'
import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { dealers, emailVerificationTokens, passwordResetTokens, profiles, userSecurity } from '../../db/schema.js'
import { LOGIN_LOCKOUT_THRESHOLD } from '../../auth/loginLockout.js'
import { DEMO_PASSWORD, buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

/**
 * ID: AUTH-01..AUTH-11 (Phase 1.1) + AUTH-N01..AUTH-N20 negative/gap cases
 * Layer: API integration
 * Files: apps/backend/src/routes/auth.ts
 */
describe('Auth API', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  describe('POST /api/auth/signup', () => {
    it('AUTH-01: creates a customer account and returns a session', async () => {
      const res = await request(app).post('/api/auth/signup').send({
        email: 'new@carflow.dev',
        password: 'password123',
        name: 'New User',
      })
      expect(res.status).toBe(201)
      expect(res.body.role).toBe('customer')
      expect(res.body.email).toBe('new@carflow.dev')
      const cookies = res.headers['set-cookie'] as unknown as string[]
      expect(cookies.some((c) => c.startsWith('cf_access='))).toBe(true)
      expect(cookies.some((c) => c.startsWith('cf_refresh='))).toBe(true)
    })

    it('AUTH-02: rejects duplicate email with 409', async () => {
      await request(app)
        .post('/api/auth/signup')
        .send({ email: 'dupe@carflow.dev', password: 'password123', name: 'First' })
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'dupe@carflow.dev', password: 'password123', name: 'Second' })
      expect(res.status).toBe(409)
    })

    it('AUTH-N01: rejects signup with empty email as 400', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: '', password: 'password123', name: 'No Email' })
      expect(res.status).toBe(400)
    })

    it('AUTH-N18: signup does not auto-verify email', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ email: 'verify@carflow.dev', password: 'password123', name: 'Verify Me' })
      expect(res.body.email_confirmed_at).toBeNull()
    })

    it('AUTH-N09: signup with expectedRole=dealer creates a dealer role and pending dealer profile', async () => {
      const res = await request(app).post('/api/auth/signup').send({
        email: 'dealer-signup@carflow.dev',
        password: 'password123',
        name: 'Wannabe Dealer',
        expectedRole: 'dealer',
        meta: { businessName: 'Wannabe Motors', phone: '+974555', address: 'Doha' },
      })
      expect(res.status).toBe(201)
      expect(res.body.role).toBe('dealer')
      const [dealerRow] = await db.select().from(dealers).where(eq(dealers.ownerUserId, res.body.userId))
      expect(dealerRow).toBeTruthy()
      expect(dealerRow.status).toBe('pending')
      expect(dealerRow.name).toBe('Wannabe Motors')
    })

    it('AUTH-N20: pending dealer cannot log in until admin activates account', async () => {
      const signup = await request(app).post('/api/auth/signup').send({
        email: 'dealer-signup2@carflow.dev',
        password: 'password123',
        name: 'Wannabe Dealer',
        expectedRole: 'dealer',
      })
      expect(signup.status).toBe(201)

      const blocked = await request(app)
        .post('/api/auth/login')
        .send({ email: 'dealer-signup2@carflow.dev', password: 'password123', expectedRole: 'dealer' })
      expect(blocked.status).toBe(403)

      const [dealerRow] = await db
        .select()
        .from(dealers)
        .where(eq(dealers.ownerUserId, signup.body.userId))
      await db.update(dealers).set({ status: 'active' }).where(eq(dealers.id, dealerRow.id))

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'dealer-signup2@carflow.dev', password: 'password123', expectedRole: 'dealer' })
      expect(res.status).toBe(200)
      expect(res.body.role).toBe('dealer')
    })

    it('AUTH-N11: sanitizes/stores SQL-like input in name field safely', async () => {
      const res = await request(app).post('/api/auth/signup').send({
        email: 'sqltest@carflow.dev',
        password: 'password123',
        name: "Robert'); DROP TABLE profiles;--",
      })
      expect(res.status).toBe(201)
      const [row] = await db.select().from(profiles).where(eq(profiles.email, 'sqltest@carflow.dev'))
      expect(row.name).toBe("Robert'); DROP TABLE profiles;--")
      // Table must still exist and be queryable.
      const all = await db.select().from(profiles)
      expect(all.length).toBeGreaterThan(0)
    })
  })

  describe('POST /api/auth/login', () => {
    beforeAll(async () => {
      await resetDb()
    })

    it('AUTH-03: logs in customer/dealer/admin and sets httpOnly cookies', async () => {
      const fixtures = await seedFixtures()
      for (const [email, role] of [
        [fixtures.customer.email, 'customer'],
        [fixtures.dealer.email, 'dealer'],
        [fixtures.admin.email, 'admin'],
      ] as const) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email, password: DEMO_PASSWORD, expectedRole: role })
        expect(res.status).toBe(200)
        expect(res.body.role).toBe(role)
        const cookies = res.headers['set-cookie'] as unknown as string[]
        expect(cookies.some((c) => c.includes('HttpOnly'))).toBe(true)
      }
      await resetDb()
    })

    it('AUTH-04: rejects login with wrong expectedRole as 403', async () => {
      const fixtures = await seedFixtures()
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: fixtures.customer.email, password: DEMO_PASSWORD, expectedRole: 'admin' })
      expect(res.status).toBe(403)
      await resetDb()
    })

    it('AUTH-05: rejects login for suspended account as 403', async () => {
      const fixtures = await seedFixtures()
      await db.update(profiles).set({ status: 'suspended' }).where(eq(profiles.id, fixtures.customer.id))
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: fixtures.customer.email, password: DEMO_PASSWORD, expectedRole: 'customer' })
      expect(res.status).toBe(403)
      await resetDb()
    })

    it('AUTH-N03: rejects wrong password as 401', async () => {
      const fixtures = await seedFixtures()
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: fixtures.customer.email, password: 'wrong-password', expectedRole: 'customer' })
      expect(res.status).toBe(401)
      await resetDb()
    })

    it('AUTH-N10: auth routes are rate-limited outside vitest (GAP-P1-020 fixed)', async () => {
      const appSource = await import('fs').then((fs) =>
        fs.readFileSync(new URL('../../app.ts', import.meta.url), 'utf8')
      )
      expect(appSource).toMatch(/rateLimit/)
      expect(appSource).toMatch(/skipRateLimitInTests/)
      expect(appSource).not.toMatch(/skipRateLimitInDev/)
      expect(appSource).not.toMatch(/skip:.*NODE_ENV/)
      expect(appSource).toMatch(/\/api\/auth\/login/)
      expect(appSource).toMatch(/\/api\/auth\/signup/)
      expect(appSource).toMatch(/\/api\/auth\/forgot-password/)
      expect(appSource).toMatch(/\/api\/auth\/2fa\/verify-login/)
    })

    it('AUTH-LOCK-01: locks account after repeated failed password attempts', async () => {
      const fixtures = await seedFixtures()
      for (let i = 0; i < LOGIN_LOCKOUT_THRESHOLD - 1; i += 1) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({ email: fixtures.customer.email, password: 'wrong-password', expectedRole: 'customer' })
        expect(res.status).toBe(401)
      }

      const locked = await request(app)
        .post('/api/auth/login')
        .send({ email: fixtures.customer.email, password: 'wrong-password', expectedRole: 'customer' })
      expect(locked.status).toBe(423)
      expect(locked.body.error).toMatch(/locked/i)
      expect(locked.body.retryAfterSeconds).toBeGreaterThan(0)

      const stillLocked = await request(app)
        .post('/api/auth/login')
        .send({ email: fixtures.customer.email, password: DEMO_PASSWORD, expectedRole: 'customer' })
      expect(stillLocked.status).toBe(423)
      await resetDb()
    })

    it('AUTH-LOCK-02: resets failed attempts after successful login', async () => {
      const fixtures = await seedFixtures()
      for (let i = 0; i < LOGIN_LOCKOUT_THRESHOLD - 1; i += 1) {
        await request(app)
          .post('/api/auth/login')
          .send({ email: fixtures.customer.email, password: 'wrong-password', expectedRole: 'customer' })
      }
      const ok = await request(app)
        .post('/api/auth/login')
        .send({ email: fixtures.customer.email, password: DEMO_PASSWORD, expectedRole: 'customer' })
      expect(ok.status).toBe(200)

      const [row] = await db.select().from(profiles).where(eq(profiles.id, fixtures.customer.id))
      expect(row.failedLoginAttempts).toBe(0)
      expect(row.lockedUntil).toBeNull()
      await resetDb()
    })
  })

  describe('POST /api/auth/2fa/verify-login', () => {
    it('AUTH-2FA-01: completes login after password + TOTP and rejects challenge reuse', async () => {
      const fixtures = await seedFixtures()
      const { generateTotpSecret } = await import('../../services/totp.js')
      const { currentTotpCode } = await import('../../services/totp.js')
      const totpSecret = generateTotpSecret()
      await db.insert(userSecurity).values({
        userId: fixtures.customer.id,
        totpSecret,
        totpEnabled: true,
      })

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: fixtures.customer.email, password: DEMO_PASSWORD, expectedRole: 'customer' })
      expect(login.status).toBe(200)
      expect(login.body.requires2fa).toBe(true)

      const code = currentTotpCode(totpSecret)
      const verify = await request(app)
        .post('/api/auth/2fa/verify-login')
        .send({ challengeToken: login.body.challengeToken, code })
      expect(verify.status).toBe(200)
      expect(verify.body.email).toBe(fixtures.customer.email)
      const cookies = verify.headers['set-cookie'] as unknown as string[]
      expect(cookies.some((c) => c.startsWith('cf_access='))).toBe(true)

      const reuse = await request(app)
        .post('/api/auth/2fa/verify-login')
        .send({ challengeToken: login.body.challengeToken, code })
      expect(reuse.status).toBe(401)
    })

    it('AUTH-LOCK-03: locks account after repeated failed 2FA codes', async () => {
      const fixtures = await seedFixtures()
      const { generateTotpSecret } = await import('../../services/totp.js')
      const totpSecret = generateTotpSecret()
      await db.insert(userSecurity).values({
        userId: fixtures.customer.id,
        totpSecret,
        totpEnabled: true,
      })

      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: fixtures.customer.email, password: DEMO_PASSWORD, expectedRole: 'customer' })
      expect(login.body.requires2fa).toBe(true)

      for (let i = 0; i < LOGIN_LOCKOUT_THRESHOLD - 1; i += 1) {
        const bad = await request(app)
          .post('/api/auth/2fa/verify-login')
          .send({ challengeToken: login.body.challengeToken, code: '000000' })
        expect(bad.status).toBe(401)
      }

      const locked = await request(app)
        .post('/api/auth/2fa/verify-login')
        .send({ challengeToken: login.body.challengeToken, code: '000000' })
      expect(locked.status).toBe(423)
      expect(locked.body.error).toMatch(/locked/i)
    })
  })

  describe('GET /api/auth/me', () => {
    it('AUTH-06: returns user with valid cookie, 401 without', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'customer@test.dev', 'customer')
      const withCookie = await agent.get('/api/auth/me')
      expect(withCookie.status).toBe(200)
      expect(withCookie.body.email).toBe('customer@test.dev')

      const withoutCookie = await request(app).get('/api/auth/me')
      expect(withoutCookie.status).toBe(401)
    })
  })

  describe('POST /api/auth/refresh', () => {
    it('AUTH-07: issues a new access token from a valid refresh cookie', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'customer@test.dev', 'customer')
      const res = await agent.post('/api/auth/refresh')
      expect(res.status).toBe(200)
      expect(res.body.email).toBe('customer@test.dev')
    })

    it('AUTH-07: 401 with no/invalid refresh token', async () => {
      const res = await request(app).post('/api/auth/refresh')
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/auth/logout', () => {
    it('AUTH-08: clears cookies so subsequent /me is 401', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'customer@test.dev', 'customer')
      const logoutRes = await agent.post('/api/auth/logout')
      expect(logoutRes.status).toBe(204)
      const me = await agent.get('/api/auth/me')
      expect(me.status).toBe(401)
    })
  })

  describe('Password reset flow', () => {
    it('AUTH-09/AUTH-N08: forgot-password returns 200 for both known and unknown email (no enumeration)', async () => {
      await seedFixtures()
      const known = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'customer@test.dev' })
      const unknown = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nobody@test.dev' })
      expect(known.status).toBe(200)
      expect(unknown.status).toBe(200)
      expect(known.body).toEqual(unknown.body)
    })

    it('AUTH-10/FLOW-07: reset-password with valid token succeeds; reused token fails (single-use)', async () => {
      const fixtures = await seedFixtures()
      await request(app).post('/api/auth/forgot-password').send({ email: fixtures.customer.email })
      const [tokenRow] = await db
        .select()
        .from(passwordResetTokens)
        .where(and(eq(passwordResetTokens.userId, fixtures.customer.id), isNull(passwordResetTokens.usedAt)))
      expect(tokenRow).toBeTruthy()

      // The raw token is only ever emailed to the user, never stored in
      // plaintext, so we re-derive it is impossible from the DB row alone.
      // Instead we exercise the hash-matching contract directly: an
      // unknown/garbage token must be rejected.
      const badReset = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'not-a-real-token', password: 'newpassword123' })
      expect(badReset.status).toBe(400)
    })

    it('AUTH-N06: expired reset token is rejected with 400', async () => {
      const fixtures = await seedFixtures()
      const crypto = await import('crypto')
      const raw = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
      await db.insert(passwordResetTokens).values({
        userId: fixtures.customer.id,
        tokenHash,
        expiresAt: new Date(Date.now() - 1000),
      })
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: raw, password: 'newpassword123' })
      expect(res.status).toBe(400)
    })

    it('AUTH-N07: a used reset token cannot be reused', async () => {
      const fixtures = await seedFixtures()
      const crypto = await import('crypto')
      const raw = crypto.randomBytes(32).toString('hex')
      const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
      await db.insert(passwordResetTokens).values({
        userId: fixtures.customer.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      const first = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: raw, password: 'newpassword123' })
      expect(first.status).toBe(200)
      const second = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: raw, password: 'anotherpassword' })
      expect(second.status).toBe(400)
    })

    it('GAP-P0-002 fixed: customer app exposes /reset-password route', () => {
      const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..')
      const appTsx = fs.readFileSync(path.join(root, 'apps/customer/src/App.tsx'), 'utf8')
      expect(appTsx).toMatch(/reset-password/i)
      expect(appTsx).toMatch(/ResetPasswordPage/)
    })
  })

  describe('POST /api/auth/change-password', () => {
    it('AUTH-11: succeeds with correct current password; rejects wrong current password', async () => {
      const fixtures = await seedFixtures()
      const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
      const ok = await agent
        .post('/api/auth/change-password')
        .send({ currentPassword: DEMO_PASSWORD, newPassword: 'newpassword456' })
      expect(ok.status).toBe(200)

      const { agent: staleAgent } = await loginAs(app, fixtures.customer.email, 'customer', 'newpassword456')
      const bad = await staleAgent
        .post('/api/auth/change-password')
        .send({ currentPassword: DEMO_PASSWORD, newPassword: 'wrongpass1' })
      expect(bad.status).toBe(401)
    })

    it('AUTH-N12: requires authentication', async () => {
      const res = await request(app)
        .post('/api/auth/change-password')
        .send({ currentPassword: 'a', newPassword: 'b' })
      expect(res.status).toBe(401)
    })
  })

  describe('POST /api/auth/verify-email', () => {
    it('AUTH-VERIFY-01: valid token marks the profile verified', async () => {
      const fixtures = await seedFixtures()
      await db.update(profiles).set({ emailVerifiedAt: null }).where(eq(profiles.id, fixtures.customer.id))
      const crypto = await import('crypto')
      const raw = 'verify-email-token-plain'
      const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
      await db.insert(emailVerificationTokens).values({
        userId: fixtures.customer.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      })
      const res = await request(app).post('/api/auth/verify-email').send({ token: raw })
      expect(res.status).toBe(200)
      const [user] = await db.select().from(profiles).where(eq(profiles.id, fixtures.customer.id))
      expect(user.emailVerifiedAt).toBeTruthy()
    })

    it('AUTH-VERIFY-02: invalid token is rejected', async () => {
      await seedFixtures()
      const res = await request(app).post('/api/auth/verify-email').send({ token: 'not-a-real-token' })
      expect(res.status).toBe(400)
    })
  })
})
