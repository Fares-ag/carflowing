/**
 * Qatar pricing is all-inclusive — no separate sales tax line items.
 *
 * Node-safe pricing entrypoint (`@carflow/shared/pricing`). The backend must
 * not import from the package root — that pulls UI assets (PNG imports, React
 * components) Node cannot load — so the subscription money helpers are
 * re-exported here. Keep this file free of anything that touches the DOM or
 * imports an asset: `scripts/verify-shared-production-exports.mjs` imports
 * every published subpath in the production image and fails the build if one
 * of them cannot be loaded by plain Node.
 *
 * Server and client quote the same monthly price only if both sides go through
 * `computeSubscriptionMonthly` (see apps/backend/src/services/booking.ts).
 */
export {
  SUBSCRIPTION_DURATION_OPTIONS,
  SUBSCRIPTION_PRICING_LABELS,
  computeFirstMonthDue,
  computeMinimumTermTotal,
  computeSubscriptionMonthly,
  durationOption,
} from './subscription.js'
export { computeMonthlyPrice, computeRentalTotal } from './utils.js'
