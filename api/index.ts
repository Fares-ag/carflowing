/**
 * Vercel serverless entry — NOT the supported production boot path.
 *
 * This module does NOT start the in-process job scheduler (billing, dunning,
 * webhook reconciliation, hold release, payouts) or Sentry observability.
 * Use only when EXTERNAL_SCHEDULER=true and an external cron invokes
 * POST /api/admin/jobs/run-once on a schedule.
 *
 * Supported production topology: Railway long-lived Node (apps/backend/src/index.ts).
 */
import { createApp } from '../apps/backend/dist/app.js'
import { assertProductionSecrets } from '../apps/backend/dist/utils/productionGuards.js'

if (process.env.EXTERNAL_SCHEDULER !== 'true') {
  throw new Error(
    'api/index.ts requires EXTERNAL_SCHEDULER=true — deploy the API on Railway (apps/backend/src/index.ts) instead'
  )
}

if (process.env.NODE_ENV === 'production') {
  assertProductionSecrets()
}

export default createApp()
