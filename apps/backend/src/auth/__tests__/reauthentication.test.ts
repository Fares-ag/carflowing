import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { userSecurity } from '../../db/schema.js'
import { DEMO_PASSWORD, resetDb, seedFixtures } from '../../test/helpers.js'
import { currentTotpCode, generateTotpSecret } from '../../services/totp.js'
import {
  REAUTH_MAX_ATTEMPTS,
  reauthenticate,
  resetReauthenticationThrottle,
} from '../reauthentication.js'

/**
 * ID: REAUTH-01..05 — step-up confirmation for irreversible actions.
 * Files: apps/backend/src/auth/reauthentication.ts
 */
describe('reauthenticate', () => {
  beforeEach(() => {
    resetReauthenticationThrottle()
  })

  afterEach(async () => {
    resetReauthenticationThrottle()
    await resetDb()
  })

  it('REAUTH-01: rejects a request that carries no credential at all', async () => {
    const fixtures = await seedFixtures()
    const outcome = await reauthenticate(fixtures.customer.id, {})
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe(400)
  })

  it('REAUTH-02: accepts the current password and rejects a wrong one', async () => {
    const fixtures = await seedFixtures()
    expect((await reauthenticate(fixtures.customer.id, { password: DEMO_PASSWORD })).ok).toBe(true)
    const bad = await reauthenticate(fixtures.customer.id, { password: 'not-my-password' })
    expect(bad.ok).toBe(false)
    expect(bad.status).toBe(401)
  })

  it('REAUTH-03: accepts a current TOTP code instead of the password', async () => {
    const fixtures = await seedFixtures()
    const totpSecret = generateTotpSecret()
    await db.insert(userSecurity).values({
      userId: fixtures.customer.id,
      totpSecret,
      totpEnabled: true,
    })
    const outcome = await reauthenticate(fixtures.customer.id, {
      code: currentTotpCode(totpSecret),
    })
    expect(outcome.ok).toBe(true)
    expect((await reauthenticate(fixtures.customer.id, { code: '000000' })).ok).toBe(false)
  })

  it('REAUTH-04: a TOTP code is not accepted when 2FA is not enrolled', async () => {
    const fixtures = await seedFixtures()
    const totpSecret = generateTotpSecret()
    // Secret present but never confirmed — must not count as a credential.
    await db.insert(userSecurity).values({
      userId: fixtures.customer.id,
      totpSecret,
      totpEnabled: false,
    })
    const outcome = await reauthenticate(fixtures.customer.id, {
      code: currentTotpCode(totpSecret),
    })
    expect(outcome.ok).toBe(false)
    expect(outcome.status).toBe(401)
  })

  it('REAUTH-05: throttles repeated failures with 429 and clears on success', async () => {
    const fixtures = await seedFixtures()
    for (let i = 0; i < REAUTH_MAX_ATTEMPTS; i += 1) {
      const attempt = await reauthenticate(fixtures.customer.id, { password: 'wrong' })
      expect(attempt.status).toBe(401)
    }
    const throttled = await reauthenticate(fixtures.customer.id, { password: DEMO_PASSWORD })
    expect(throttled.ok).toBe(false)
    expect(throttled.status).toBe(429)
    expect(throttled.retryAfterSeconds).toBeGreaterThan(0)

    // Another account is unaffected — the throttle is per user.
    expect((await reauthenticate(fixtures.customer2.id, { password: DEMO_PASSWORD })).ok).toBe(true)

    resetReauthenticationThrottle()
    expect((await reauthenticate(fixtures.customer.id, { password: DEMO_PASSWORD })).ok).toBe(true)
  })
})
