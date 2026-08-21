/** Whether Twilio credentials are configured for outbound SMS. */
export function isTwilioSmsConfigured(): boolean {
  return !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  )
}

/**
 * SMS verification is offered when Twilio is configured, explicitly enabled,
 * or in non-production (codes are logged server-side for local testing).
 */
export function isSmsVerificationAvailable(): boolean {
  if (isTwilioSmsConfigured()) return true
  if (process.env.SMS_VERIFICATION_ENABLED === 'true') return true
  if (process.env.NODE_ENV !== 'production') return true
  return false
}

export function getSmsVerificationCapabilities() {
  const smsProviderConfigured = isTwilioSmsConfigured()
  return {
    smsVerificationAvailable: isSmsVerificationAvailable(),
    smsProviderConfigured,
    /** True when verification works via server logs instead of real SMS delivery. */
    smsDevFallback: !smsProviderConfigured && process.env.NODE_ENV !== 'production',
  }
}
