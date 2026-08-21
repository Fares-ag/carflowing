import { eq, desc } from 'drizzle-orm'
import { sqlClient, db } from '../db/index.js'
import { appSettings, jobRuns } from '../db/schema.js'
import { captureException, captureMessage } from '../utils/observability.js'
import { logStructured } from '../utils/requestContext.js'
import { recordDailyRollups } from './analyticsRollups.js'
import { processEmailOutbox } from './emailOutbox.js'
import { generateDueInvoices, markOverdueInvoices, releaseExpiredHolds } from './billing.js'
import { countStuckPendingPayments, getLastJobsSweepAt } from './healthMetrics.js'
import { sendInvoicePaymentReminders } from './invoiceReminders.js'
import { JOBS_ADVISORY_LOCK_KEY } from './jobsLock.js'
import { generateDealerPayouts } from './payouts.js'
import { reconcilePendingSkipCashPayments } from './reconciliation.js'

export function jobsIntervalMs(): number {
  const n = Number(process.env.JOBS_INTERVAL_MS)
  return Number.isFinite(n) && n >= 15_000 ? n : 5 * 60 * 1000
}

async function runJobSafe<T>(
  job: string,
  fn: () => Promise<T>,
  fallback: T,
  failures: string[]
): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    failures.push(job)
    logStructured('error', 'jobs.job_failed', {
      job,
      error: err instanceof Error ? err.message : String(err),
    })
    captureException(err, { job })
    return fallback
  }
}

async function runPostSweepAlerts(previousSweepAt: Date | null): Promise<void> {
  const stuckPendingCount = await countStuckPendingPayments()
  const interval = jobsIntervalMs()

  if (stuckPendingCount > 0) {
    const message = `Scheduler alert: ${stuckPendingCount} payment(s) pending longer than 30 minutes`
    logStructured('warn', 'jobs.alert.stuck_pending', { stuckPendingCount })
    captureMessage(message, 'warning')
  }

  if (previousSweepAt) {
    const ageMs = Date.now() - previousSweepAt.getTime()
    if (ageMs > 2 * interval) {
      const message = `Scheduler alert: last sweep was ${Math.round(ageMs / 1000)}s ago (threshold ${Math.round((2 * interval) / 1000)}s)`
      logStructured('warn', 'jobs.alert.stale_sweep', {
        previousSweepAt: previousSweepAt.toISOString(),
        ageMs,
        thresholdMs: 2 * interval,
      })
      captureMessage(message, 'warning')
    }
  }
}

export async function runJobsOnce(): Promise<{
  invoices: number
  overdue: number
  reconciled: number
  holdsReleased: number
  payouts: number
  reminders: number
} | null> {
  // pg advisory locks are SESSION-scoped, and sqlClient is a connection POOL:
  // lock and unlock must run on the SAME physical connection or the lock
  // wedges on an idle pooled connection and every future sweep is skipped
  // (found in re-audit). reserve() pins one connection for the whole sweep.
  const reserved = await sqlClient.reserve()
  const startedAt = new Date()
  let runId: string | null = null
  try {
    const [lock] = await reserved`SELECT pg_try_advisory_lock(${JOBS_ADVISORY_LOCK_KEY}) AS locked`
    if (!lock?.locked) return null
    try {
      const previousSweepAt = await getLastJobsSweepAt()
      const [runRow] = await db.insert(jobRuns).values({ startedAt }).returning({ id: jobRuns.id })
      runId = runRow.id

      const failures: string[] = []
      const invoices = await runJobSafe('generateDueInvoices', generateDueInvoices, 0, failures)
      const overdue = await runJobSafe('markOverdueInvoices', markOverdueInvoices, 0, failures)
      const reminders = await runJobSafe('sendInvoicePaymentReminders', sendInvoicePaymentReminders, 0, failures)
      const reconciled = await runJobSafe(
        'reconcilePendingSkipCashPayments',
        reconcilePendingSkipCashPayments,
        0,
        failures
      )
      const holdsReleased = await runJobSafe('releaseExpiredHolds', releaseExpiredHolds, 0, failures)
      const payouts = await runJobSafe('generateDealerPayouts', generateDealerPayouts, 0, failures)
      const outboxDelivered = await runJobSafe('processEmailOutbox', processEmailOutbox, 0, failures)
      await runJobSafe('recordDailyRollups', recordDailyRollups, undefined, failures)

      const sweptAt = new Date()
      logStructured('info', 'jobs.sweep_ok', {
        at: sweptAt.toISOString(),
        invoices,
        overdue,
        reminders,
        reconciled,
        holdsReleased,
        payouts,
        outboxDelivered,
        failedJobs: failures,
      })

      const [settingsRow] = await db
        .select({ id: appSettings.id })
        .from(appSettings)
        .orderBy(desc(appSettings.updatedAt))
        .limit(1)
      if (settingsRow) {
        await db
          .update(appSettings)
          .set({ lastJobsSweepAt: sweptAt })
          .where(eq(appSettings.id, settingsRow.id))
      }

      await runPostSweepAlerts(previousSweepAt)

      if (runId) {
        await db
          .update(jobRuns)
          .set({
            completedAt: sweptAt,
            invoices,
            overdue,
            reminders,
            reconciled,
            holdsReleased,
            payouts,
            ...(failures.length
              ? { error: `Failed jobs: ${failures.join(', ')}` }
              : {}),
          })
          .where(eq(jobRuns.id, runId))
      }

      return { invoices, overdue, reconciled, holdsReleased, payouts, reminders }
    } catch (err) {
      if (runId) {
        await db
          .update(jobRuns)
          .set({
            completedAt: new Date(),
            error: err instanceof Error ? err.message : 'Job sweep failed',
          })
          .where(eq(jobRuns.id, runId))
      }
      logStructured('error', 'jobs.sweep_failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      captureException(err, { scope: 'jobs_sweep' })
      throw err
    } finally {
      await reserved`SELECT pg_advisory_unlock(${JOBS_ADVISORY_LOCK_KEY})`
    }
  } finally {
    reserved.release()
  }
}

let timer: ReturnType<typeof setInterval> | null = null

/**
 * In-process job loop: billing generation, dunning, webhook reconciliation,
 * abandoned-hold cleanup. Idempotent sweeps + a Postgres advisory lock make
 * this safe to run on every API instance. Disable with ENABLE_JOBS=false
 * (tests do; they call runJobsOnce() deterministically instead).
 */
export function startScheduler(): void {
  if (process.env.ENABLE_JOBS === 'false' || process.env.VITEST === 'true') return
  if (timer) return
  const tick = () => {
    runJobsOnce().catch((err) => {
      logStructured('error', 'jobs.sweep_failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      captureException(err, { scope: 'jobs_scheduler_tick' })
    })
  }
  // First run shortly after boot so a restarted instance catches up quickly.
  setTimeout(tick, 10_000)
  timer = setInterval(tick, jobsIntervalMs())
  timer.unref?.()
  logStructured('info', 'jobs.scheduler_started', { intervalMs: jobsIntervalMs() })
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
