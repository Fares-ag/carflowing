import { afterEach, describe, expect, it } from 'vitest'
import { isStaffTwoFactorRequired, staffTwoFactorMissing } from '../staffTwoFactor.js'

/**
 * ID: STAFF-2FA-01..03 — mandatory TOTP policy for admin-portal roles.
 * Files: apps/backend/src/auth/staffTwoFactor.ts
 */
describe('staff 2FA policy', () => {
  const originalFlag = process.env.REQUIRE_STAFF_2FA
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    if (originalFlag === undefined) delete process.env.REQUIRE_STAFF_2FA
    else process.env.REQUIRE_STAFF_2FA = originalFlag
    process.env.NODE_ENV = originalNodeEnv
  })

  it('STAFF-2FA-01: defaults to on in production and off elsewhere', () => {
    delete process.env.REQUIRE_STAFF_2FA
    process.env.NODE_ENV = 'production'
    expect(isStaffTwoFactorRequired()).toBe(true)
    process.env.NODE_ENV = 'test'
    expect(isStaffTwoFactorRequired()).toBe(false)
  })

  it('STAFF-2FA-02: the env flag overrides the default in both directions', () => {
    process.env.NODE_ENV = 'production'
    process.env.REQUIRE_STAFF_2FA = 'false'
    expect(isStaffTwoFactorRequired()).toBe(false)
    process.env.NODE_ENV = 'test'
    process.env.REQUIRE_STAFF_2FA = 'true'
    expect(isStaffTwoFactorRequired()).toBe(true)
  })

  it('STAFF-2FA-03: applies to every admin-portal role and to no one else', () => {
    process.env.REQUIRE_STAFF_2FA = 'true'
    for (const role of ['admin', 'finance', 'ops', 'support'] as const) {
      expect(staffTwoFactorMissing(role, false)).toBe(true)
      expect(staffTwoFactorMissing(role, true)).toBe(false)
    }
    expect(staffTwoFactorMissing('customer', false)).toBe(false)
    expect(staffTwoFactorMissing('dealer', false)).toBe(false)

    process.env.REQUIRE_STAFF_2FA = 'false'
    expect(staffTwoFactorMissing('admin', false)).toBe(false)
  })
})
