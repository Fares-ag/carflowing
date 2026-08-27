/**
 * Spend guard for the SMS verification endpoint. Every send costs real money at
 * Twilio and the endpoint accepts an arbitrary destination number, so an
 * authenticated attacker could otherwise pump unbounded traffic through it.
 *
 * Counters live in process memory, the same store `express-rate-limit` uses in
 * app.ts — good enough for the single API instance this deploys to, and it
 * needs no schema change. A multi-instance deploy needs a shared store; see
 * `risks` in the remediation report.
 */

/** Minimum gap between two sends for the same user or the same phone number. */
export const SMS_SEND_COOLDOWN_MS = 60 * 1000
/** Rolling-window length for the daily cap. */
export const SMS_SEND_WINDOW_MS = 24 * 60 * 60 * 1000
/** Maximum sends per user per rolling day. */
export const SMS_SEND_DAILY_MAX_PER_USER = 5
/** Maximum sends per destination number per rolling day (across all users). */
export const SMS_SEND_DAILY_MAX_PER_PHONE = 5

/** Send timestamps (ms) per bucket key, oldest first. */
const sendLog = new Map<string, number[]>()

/** Collapses formatting differences so `+974 5000 1234` shares a bucket. */
export function smsPhoneKey(phone: string): string {
  return phone.replace(/[^\d+]/g, '')
}

function recent(key: string, now: number): number[] {
  const hits = (sendLog.get(key) ?? []).filter((at) => now - at < SMS_SEND_WINDOW_MS)
  if (hits.length === 0) {
    sendLog.delete(key)
  } else {
    sendLog.set(key, hits)
  }
  return hits
}

export interface SmsSendAllowance {
  allowed: boolean
  /** Seconds the caller should wait before retrying (>= 1 when blocked). */
  retryAfterSeconds: number
  error?: string
}

function blocked(retryAfterMs: number, error: string): SmsSendAllowance {
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)), error }
}

/**
 * Checks the per-user and per-phone limits and, when the send is allowed,
 * records it in the same call so two concurrent requests cannot both pass.
 */
export function consumeSmsSendAllowance(userId: string, phone: string): SmsSendAllowance {
  const now = Date.now()
  const userKey = `user:${userId}`
  const phoneKey = `phone:${smsPhoneKey(phone)}`
  const userHits = recent(userKey, now)
  const phoneHits = recent(phoneKey, now)

  const lastHit = Math.max(userHits[userHits.length - 1] ?? 0, phoneHits[phoneHits.length - 1] ?? 0)
  if (lastHit && now - lastHit < SMS_SEND_COOLDOWN_MS) {
    return blocked(
      SMS_SEND_COOLDOWN_MS - (now - lastHit),
      'A verification code was just sent. Wait a moment before requesting another.'
    )
  }
  if (userHits.length >= SMS_SEND_DAILY_MAX_PER_USER) {
    return blocked(
      SMS_SEND_WINDOW_MS - (now - userHits[0]),
      'Too many verification codes requested today. Try again tomorrow.'
    )
  }
  if (phoneHits.length >= SMS_SEND_DAILY_MAX_PER_PHONE) {
    return blocked(
      SMS_SEND_WINDOW_MS - (now - phoneHits[0]),
      'Too many verification codes sent to this number today. Try again tomorrow.'
    )
  }

  sendLog.set(userKey, [...userHits, now])
  sendLog.set(phoneKey, [...phoneHits, now])
  return { allowed: true, retryAfterSeconds: 0 }
}

/** Test-only: clears every counter so cases do not leak into each other. */
export function resetSmsSendLimits(): void {
  sendLog.clear()
}
