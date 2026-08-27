import { and, asc, count, eq, inArray, lt, lte, or, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { emailOutbox } from '../db/schema.js'
import { fetchWithTimeout } from '../utils/http.js'
import { captureMessage } from '../utils/observability.js'
import { logStructured } from '../utils/requestContext.js'

export const MAX_EMAIL_ATTEMPTS = 5

/**
 * Transactional mail (password resets, dunning, dealer invites) must never queue
 * behind a marketing blast. email_outbox has no priority column yet, so marketing
 * rows are enqueued with a deliberately deferred next_attempt_at and the drain
 * runs in two passes: transactional first, marketing only with the leftover
 * budget. See the priority-column request in the jobs-email report.
 */
export type EmailPriority = 'transactional' | 'marketing'

/** How long a freshly enqueued marketing email waits behind transactional mail. */
export function marketingQueueDelayMs(): number {
  const n = Number(process.env.EMAIL_MARKETING_DELAY_MS)
  return Number.isFinite(n) && n >= 0 ? n : 60_000
}

/** Share of one drain that marketing mail may consume (0–1). */
function marketingDrainShare(): number {
  const n = Number(process.env.EMAIL_MARKETING_DRAIN_SHARE)
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.4
}

/** Days a sent/failed outbox row is kept before the retention sweep deletes it. */
export function emailOutboxRetentionDays(): number {
  const n = Number(process.env.EMAIL_OUTBOX_RETENTION_DAYS)
  return Number.isFinite(n) && n >= 1 ? n : 30
}

/**
 * A row is "deferred marketing" while it has never been attempted and its first
 * attempt was pushed into the future — the marker enqueueEmail() writes for
 * marketing mail. Retried rows (attempts > 0) always drain at normal priority.
 */
const deferredMarketing = sql`${emailOutbox.attempts} = 0 AND ${emailOutbox.nextAttemptAt} > ${emailOutbox.createdAt} + interval '30 seconds'`

/** Exponential backoff in ms before the next delivery attempt (after a failure). */
export function emailRetryBackoffMs(attempts: number): number {
  const base = 60_000
  return Math.min(base * 2 ** Math.max(0, attempts - 1), 60 * 60_000)
}

/**
 * Marketing mail carries a visible unsubscribe link tagged with this class; the
 * deliverer lifts it back out to build the List-Unsubscribe header (the outbox
 * cannot store per-message headers yet).
 */
const UNSUBSCRIBE_LINK_RE = /<a[^>]*class="carflow-unsubscribe"[^>]*href="([^"]+)"/i

export function extractUnsubscribeUrl(html: string): string | null {
  const match = UNSUBSCRIBE_LINK_RE.exec(html)
  if (!match) return null
  return match[1].replace(/&amp;/g, '&')
}

async function deliverViaResend(input: { to: string; subject: string; html: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.FROM_EMAIL || 'noreply@carflow.dev'
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY is required in production')
    }
    logStructured('info', 'mail.dev_skip', { to: input.to, subject: input.subject })
    return
  }
  const unsubscribeUrl = extractUnsubscribeUrl(input.html)
  const res = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(unsubscribeUrl
        ? {
            headers: {
              'List-Unsubscribe': `<${unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }
        : {}),
    }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Resend ${res.status}: ${text.slice(0, 500)}`)
  }
}

export async function enqueueEmail(input: {
  to: string
  subject: string
  html: string
  priority?: EmailPriority
}): Promise<string> {
  const deferMs = input.priority === 'marketing' ? marketingQueueDelayMs() : 0
  const [row] = await db
    .insert(emailOutbox)
    .values({
      to: input.to,
      subject: input.subject,
      html: input.html,
      status: 'pending',
      ...(deferMs > 0 ? { nextAttemptAt: new Date(Date.now() + deferMs) } : {}),
    })
    .returning({ id: emailOutbox.id })
  return row.id
}

export async function tryDeliverOutboxRow(id: string, force = false): Promise<'sent' | 'pending' | 'failed'> {
  const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id)).limit(1)
  if (!row) return 'failed'
  if (row.status === 'sent') return 'sent'
  if (row.status === 'failed') return 'failed'

  if (!force && row.nextAttemptAt.getTime() > Date.now()) return 'pending'

  try {
    await deliverViaResend({ to: row.to, subject: row.subject, html: row.html })
    // Rendered bodies carry live password-reset links, dealer temporary passwords
    // and staff invite tokens. Once delivered they are pure liability, so the body
    // is dropped immediately (the column is NOT NULL, hence '' rather than NULL).
    await db.update(emailOutbox).set({ status: 'sent', html: '' }).where(eq(emailOutbox.id, id))
    logStructured('info', 'mail.sent', { id, to: row.to, subject: row.subject })
    return 'sent'
  } catch (err) {
    const attempts = row.attempts + 1
    const lastError = err instanceof Error ? err.message : String(err)
    const dead = attempts >= MAX_EMAIL_ATTEMPTS
    const nextAttemptAt = new Date(Date.now() + emailRetryBackoffMs(attempts))
    await db
      .update(emailOutbox)
      .set({
        attempts,
        lastError,
        status: dead ? 'failed' : 'pending',
        nextAttemptAt: dead ? row.nextAttemptAt : nextAttemptAt,
      })
      .where(eq(emailOutbox.id, id))
    logStructured(dead ? 'error' : 'warn', dead ? 'mail.dead_letter' : 'mail.retry_scheduled', {
      id,
      to: row.to,
      subject: row.subject,
      attempts,
      error: lastError,
    })
    if (dead) {
      // A dead-lettered password reset or dunning notice is a customer who can
      // never recover their account — page a human instead of losing it silently.
      captureMessage(
        `Email dead-lettered after ${attempts} attempts: "${row.subject}" to ${row.to} (${lastError})`,
        'error'
      )
    }
    return dead ? 'failed' : 'pending'
  }
}

async function selectDrainBatch(limit: number, marketing: boolean) {
  if (limit <= 0) return []
  return db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.status, 'pending'),
        lt(emailOutbox.attempts, MAX_EMAIL_ATTEMPTS),
        // Compared against the DB clock, not a JS Date: next_attempt_at has
        // microsecond precision and a JS Date only milliseconds, so a row
        // enqueued in the same millisecond used to look like it was still in
        // the future and got skipped.
        lte(emailOutbox.nextAttemptAt, sql`now()`),
        marketing ? deferredMarketing : sql`NOT (${deferredMarketing})`
      )
    )
    .orderBy(asc(emailOutbox.nextAttemptAt), asc(emailOutbox.createdAt))
    .limit(limit)
}

/**
 * Processes pending outbox rows (scheduler + manual retry). Transactional mail
 * drains first, oldest-first; marketing only gets the leftover budget so a blast
 * can never starve password-reset retries.
 */
export async function processEmailOutbox(limit = 50): Promise<number> {
  const transactional = await selectDrainBatch(limit, false)
  const marketingBudget = Math.min(
    limit - transactional.length,
    Math.max(1, Math.floor(limit * marketingDrainShare()))
  )
  const marketing = await selectDrainBatch(marketingBudget, true)

  let delivered = 0
  for (const { id } of [...transactional, ...marketing]) {
    if ((await tryDeliverOutboxRow(id)) === 'sent') delivered += 1
  }
  return delivered
}

/** Dead-lettered rows an admin still has to deal with. */
export async function countDeadLetteredEmails(): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(emailOutbox)
    .where(eq(emailOutbox.status, 'failed'))
  return Number(row?.value ?? 0)
}

/** Admin surface for the dead-letter queue (bodies are never returned). */
export async function listDeadLetteredEmails(limit = 50) {
  const rows = await db
    .select({
      id: emailOutbox.id,
      to: emailOutbox.to,
      subject: emailOutbox.subject,
      attempts: emailOutbox.attempts,
      lastError: emailOutbox.lastError,
      createdAt: emailOutbox.createdAt,
    })
    .from(emailOutbox)
    .where(eq(emailOutbox.status, 'failed'))
    .orderBy(asc(emailOutbox.createdAt))
    .limit(limit)
  return rows.map((row) => ({
    id: row.id,
    to: row.to,
    subject: row.subject,
    attempts: row.attempts,
    lastError: row.lastError,
    createdAt: row.createdAt.toISOString(),
  }))
}

/**
 * Re-queues dead-lettered mail once the provider outage that killed it is fixed
 * (admin action). Rows whose body was already redacted cannot be resent.
 */
export async function retryDeadLetteredEmails(ids?: string[]): Promise<number> {
  const rows = await db
    .update(emailOutbox)
    .set({ status: 'pending', attempts: 0, lastError: null, nextAttemptAt: new Date() })
    .where(
      and(
        eq(emailOutbox.status, 'failed'),
        sql`length(${emailOutbox.html}) > 0`,
        ...(ids && ids.length ? [inArray(emailOutbox.id, ids)] : [])
      )
    )
    .returning({ id: emailOutbox.id })
  if (rows.length) {
    logStructured('info', 'mail.dead_letter_requeued', { count: rows.length })
  }
  return rows.length
}

/**
 * Retention sweep: sent bodies are already blanked at delivery, this drops the
 * rows themselves (recipient address + subject) once past the window.
 */
export async function purgeExpiredEmailOutbox(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - emailOutboxRetentionDays() * 24 * 60 * 60 * 1000)
  const rows = await db
    .delete(emailOutbox)
    .where(
      and(
        or(eq(emailOutbox.status, 'sent'), eq(emailOutbox.status, 'failed')),
        lt(emailOutbox.createdAt, cutoff)
      )
    )
    .returning({ id: emailOutbox.id })
  return rows.length
}

/**
 * Backstop for rows written before delivery-time redaction shipped: blanks the
 * body of anything already marked sent.
 */
export async function redactSentEmailBodies(): Promise<number> {
  const rows = await db
    .update(emailOutbox)
    .set({ html: '' })
    .where(and(eq(emailOutbox.status, 'sent'), sql`length(${emailOutbox.html}) > 0`))
    .returning({ id: emailOutbox.id })
  return rows.length
}
