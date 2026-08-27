import { eq, desc, lt } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  appSettings,
  emailVerificationTokens,
  jobRuns,
  passwordResetTokens,
  refreshSessions,
  twoFaChallenges,
} from '../db/schema.js'
import { captureException, captureMessage } from '../utils/observability.js'
import { logStructured } from '../utils/requestContext.js'
import { purgeOldAnalyticsEvents, recordDailyRollups } from './analyticsRollups.js'
import { processEmailOutbox, purgeExpiredEmailOutbox, redactSentEmailBodies } from './emailOutbox.js'
import { generateDueInvoices, markOverdueInvoices, releaseExpiredHolds } from './billing.js'
import {
  countPaymentsNeedingRefund,
  countStuckPendingPayments,
  getLastJobsSweepAt,
  jobsStaleThresholdMs,
} from './healthMetrics.js'
import { sendInvoicePaymentReminders } from './invoiceReminders.js'
import { jobsIntervalMs, runWithJobsAdvisoryLock } from './jobsLock.js'
import { generateDealerPayouts } from './payouts.js'
import { reconcilePendingSkipCashPayments } from './reconciliation.js'
import { resumeExpiredPauses } from './rentalLifecycle.js'

export { jobsIntervalMs }

/** Days an expired session / consumed token is kept before the retention sweep drops it. */
export function authArtifactRetentionDays(): number {
  const n = Number(process.env.AUTH_ARTIFACT_RETENTION_DAYS)
  return Number.isFinite(n) && n >= 1 ? n : 30
}

/** How often the retention sweep runs inside the job loop. */
export function retentionSweepIntervalMs(): number {
  const n = Number(process.env.RETENTION_SWEEP_INTERVAL_MS)
  return Number.isFinite(n) && n >= 60_000 ? n : 6 * 60 * 60 * 1000
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

/**
 * Deletes expired sessions and spent/expired one-time tokens. audit_logs is
 * deliberately excluded — migration 0013 makes it append-only.
 *
 * This lives here rather than in a retention module of its own only because the
 * job sweep is the single caller; the deletes are all indexed range scans on
 * expires_at.
 */
export async function purgeExpiredAuthArtifacts(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - authArtifactRetentionDays() * 24 * 60 * 60 * 1000)
  const sessions = await db
    .delete(refreshSessions)
    .where(lt(refreshSessions.expiresAt, cutoff))
    .returning({ id: refreshSessions.id })
  const resets = await db
    .delete(passwordResetTokens)
    .where(lt(passwordResetTokens.expiresAt, cutoff))
    .returning({ id: passwordResetTokens.id })
  const verifications = await db
    .delete(emailVerificationTokens)
    .where(lt(emailVerificationTokens.expiresAt, cutoff))
    .returning({ id: emailVerificationTokens.id })
  const challenges = await db
    .delete(twoFaChallenges)
    .where(lt(twoFaChallenges.expiresAt, cutoff))
    .returning({ id: twoFaChallenges.id })
  return sessions.length + resets.length + verifications.length + challenges.length
}

/** Data-retention sweep for the unbounded tables (never touches audit_logs). */
export async function runRetentionSweep(now = new Date()): Promise<{
  emailOutboxPurged: number
  emailBodiesRedacted: number
  authArtifactsPurged: number
  analyticsEventsPurged: number
}> {
  const emailBodiesRedacted = await redactSentEmailBodies()
  const emailOutboxPurged = await purgeExpiredEmailOutbox(now)
  const authArtifactsPurged = await purgeExpiredAuthArtifacts(now)
  const analyticsEventsPurged = await purgeOldAnalyticsEvents(now)
  const result = {
    emailOutboxPurged,
    emailBodiesRedacted,
    authArtifactsPurged,
    analyticsEventsPurged,
  }
  logStructured('info', 'jobs.retention_sweep', result)
  return result
}

let lastRetentionSweepAt = 0

/** Per-process cadence guard so the deletes do not run on every 5-minute tick. */
async function maybeRunRetentionSweep(): Promise<void> {
  const now = Date.now()
  if (lastRetentionSweepAt && now - lastRetentionSweepAt < retentionSweepIntervalMs()) return
  lastRetentionSweepAt = now
  await runRetentionSweep(new Date(now))
}

/** Test seam: forget the last retention run so the next sweep performs one. */
export function resetRetentionSweepCadence(): void {
  lastRetentionSweepAt = 0
}

async function runPostSweepAlerts(previousSweepAt: Date | null): Promise<void> {
  const [stuckPendingCount, needsRefundCount] = await Promise.all([
    countStuckPendingPayments(),
    countPaymentsNeedingRefund(),
  ])
  const interval = jobsIntervalMs()

  if (stuckPendingCount > 0) {
    const message = `Scheduler alert: ${stuckPendingCount} payment(s) pending longer than 30 minutes`
    logStructured('warn', 'jobs.alert.stuck_pending', { stuckPendingCount })
    captureMessage(message, 'warning')
  }

  if (needsRefundCount > 0) {
    // Money captured at the provider that never became a booking. Every one of
    // these is a customer owed a refund, so this pages at error level.
    const message = `Scheduler alert: ${needsRefundCount} payment(s) captured but unusable and awaiting refund`
    logStructured('error', 'jobs.alert.needs_refund', { needsRefundCount })
    captureMessage(message, 'error')
  }

  if (previousSweepAt) {
    const ageMs = Date.now() - previousSweepAt.getTime()
    if (ageMs > 2 * interval) {
      const message = `Scheduler alert: last sweep was ${Math.round(ageMs / 1000)}s ago (threshold ${Math.round((2 * interval) / 1000)}s)`
      logStructured('warn', 'jobs.alert.stale_sweep', {
        previousSweepAt: previousSweepAt.toISOString(),
        ageMs,
        thresholdMs: 2 * interval,
        // /health uses the wider threshold and, unlike this alarm, reports even
        // when the scheduler is dead and no sweep runs at all.
        healthThresholdMs: jobsStaleThresholdMs(),
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
  pausesResumed: number
} | null> {
  return runWithJobsAdvisoryLock(async () => {
    const startedAt = new Date()
    let runId: string | null = null
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
      const pausesResumed = await runJobSafe('resumeExpiredPauses', resumeExpiredPauses, 0, failures)
      const outboxDelivered = await runJobSafe('processEmailOutbox', processEmailOutbox, 0, failures)
      await runJobSafe('recordDailyRollups', recordDailyRollups, undefined, failures)
      await runJobSafe('retentionSweep', maybeRunRetentionSweep, undefined, failures)

      const sweptAt = new Date()
      logStructured('info', 'jobs.sweep_ok', {
        at: sweptAt.toISOString(),
        invoices,
        overdue,
        reminders,
        reconciled,
        holdsReleased,
        payouts,
        pausesResumed,
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

      return { invoices, overdue, reconciled, holdsReleased, payouts, reminders, pausesResumed }
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
    }
  })
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
