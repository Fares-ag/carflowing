import { apiRequest } from '@carflow/shared'

/**
 * Account-security endpoints. These live on the role-agnostic
 * `/api/auth/security` router (apps/backend/src/auth/securityRouter.ts), which
 * is the same router the customer app reaches at `/api/customer/security` —
 * dealers and staff have no customer-scoped path, so they use this one.
 */

export interface SecurityStatus {
  totpEnabled: boolean
  /** True when the deployment forces TOTP for this account's role. */
  totpRequired: boolean
  smsVerified: boolean
  smsPhone: string | null
  smsVerificationAvailable: boolean
  smsProviderConfigured: boolean
  smsDevFallback: boolean
}

export interface TotpSetupResult {
  secret: string
  uri: string
}

export async function getSecurityStatus(): Promise<SecurityStatus> {
  return apiRequest('/auth/security')
}

/**
 * Starts (or re-starts) TOTP enrolment. Re-running this while 2FA is already
 * on rotates the secret and needs a current code, so the backend answers 409
 * unless `code` is supplied.
 */
export async function setup2fa(code?: string): Promise<TotpSetupResult> {
  return apiRequest('/auth/security/2fa/setup', {
    method: 'POST',
    body: code ? { code } : {},
  })
}

export async function enable2fa(code: string): Promise<{ ok: true }> {
  return apiRequest('/auth/security/2fa/enable', { method: 'POST', body: { code } })
}

export async function disable2fa(code: string): Promise<{ ok: true }> {
  return apiRequest('/auth/security/2fa/disable', { method: 'POST', body: { code } })
}
