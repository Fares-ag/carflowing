/**
 * Build-time feature flags (Vite env, read from the monorepo root .env).
 *
 * Every flag defaults to OFF so a missing environment variable can never ship a
 * half-finished funnel to production.
 */

/**
 * Arabic language toggle in the header.
 *
 * The i18n plumbing (translations, `setLocale`, RTL `dir` switch) is complete,
 * but only a fraction of the funnel — signup, checkout, contracts, invoices —
 * is translated and there is no RTL stylesheet yet. A visibly broken Arabic
 * mode is worse than none, so the toggle stays hidden until the funnel is
 * actually translated: set `VITE_ENABLE_LANGUAGE_TOGGLE=true` to switch it on.
 */
export const LANGUAGE_TOGGLE_ENABLED = import.meta.env.VITE_ENABLE_LANGUAGE_TOGGLE === 'true'
