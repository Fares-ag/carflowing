/**
 * Shared customer support contacts — keep Contact, FAQ, and Checkout aligned.
 *
 * Sourced from build-time config so a placeholder number can never be dialled:
 * when `VITE_SUPPORT_PHONE` is unset the phone and WhatsApp affordances render
 * nothing at all rather than a fake number.
 */
const rawSupportPhone = (import.meta.env.VITE_SUPPORT_PHONE ?? '').trim()

/** Human-readable number as configured, e.g. "+974 4012 3456". Empty when unset. */
export const SUPPORT_PHONE_DISPLAY = rawSupportPhone

/** Dialable form for `tel:` and WhatsApp links. Empty when unset. */
export const SUPPORT_PHONE_TEL = rawSupportPhone.replace(/[^\d+]/g, '')

/** Guard every phone/WhatsApp affordance with this — false hides them entirely. */
export const SUPPORT_PHONE_CONFIGURED = SUPPORT_PHONE_TEL.length > 0

export const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL ?? 'hello@carflow.qa').trim()

const rawDealerAppUrl = (import.meta.env.VITE_DEALER_APP_URL ?? '').trim()

/**
 * Where "List your cars" points. Uses the real dealer app when it is
 * configured; otherwise falls back to a mailbox on our own domain (the old
 * link pointed at carflow.ai, a domain we do not own).
 */
export const DEALER_SIGNUP_HREF = rawDealerAppUrl
  ? `${rawDealerAppUrl.replace(/\/+$/, '')}/signup`
  : `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Dealer application')}`

export const DEALER_SIGNUP_IS_EXTERNAL = rawDealerAppUrl.length > 0
