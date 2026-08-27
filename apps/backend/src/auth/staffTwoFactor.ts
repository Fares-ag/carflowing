import { isAdminPortalRole, type UserRole } from '@carflow/shared/types'
import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { userSecurity } from '../db/schema.js'

/**
 * Admin-portal accounts (admin/finance/ops/support) hold refunds, payouts and
 * every customer record, so TOTP is mandatory for them.
 *
 * Gated behind REQUIRE_STAFF_2FA because turning it on locks out every staff
 * account that has not enrolled yet: defaults to ON in production, OFF
 * everywhere else (tests, local dev). Staff must enrol at
 * POST /api/auth/security/2fa/setup + /enable before the flag is flipped.
 */
export function isStaffTwoFactorRequired(): boolean {
  const flag = process.env.REQUIRE_STAFF_2FA?.trim().toLowerCase()
  if (flag === 'true') return true
  if (flag === 'false') return false
  return process.env.NODE_ENV === 'production'
}

export const STAFF_2FA_REQUIRED_ERROR =
  'Two-factor authentication is required for staff accounts. Enrol an authenticator app before signing in.'

/** True when this role must present TOTP but has not enrolled it. */
export function staffTwoFactorMissing(role: UserRole, totpEnabled: boolean | undefined): boolean {
  return isStaffTwoFactorRequired() && isAdminPortalRole(role) && !totpEnabled
}

/**
 * Same check as `staffTwoFactorMissing`, but loads the enrolment state itself.
 * For callers that do not already hold the user_security row.
 */
export async function staffNeedsTwoFactorEnrolment(user: {
  id: string
  role: UserRole
}): Promise<boolean> {
  if (!isStaffTwoFactorRequired() || !isAdminPortalRole(user.role)) return false
  const [sec] = await db.select().from(userSecurity).where(eq(userSecurity.userId, user.id)).limit(1)
  return staffTwoFactorMissing(user.role, sec?.totpEnabled)
}
