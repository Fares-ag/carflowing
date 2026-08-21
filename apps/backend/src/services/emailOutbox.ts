import { and, eq, lt, lte } from 'drizzle-orm'
import { db } from '../db/index.js'
import { emailOutbox } from '../db/schema.js'
import { fetchWithTimeout } from '../utils/http.js'
import { logStructured } from '../utils/requestContext.js'

export const MAX_EMAIL_ATTEMPTS = 5

/** Exponential backoff in ms before the next delivery attempt (after a failure). */
export function emailRetryBackoffMs(attempts: number): number {
  const base = 60_000
  return Math.min(base * 2 ** Math.max(0, attempts - 1), 60 * 60_000)
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
  const res = await fetchWithTimeout('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html }),
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
}): Promise<string> {
  const [row] = await db
    .insert(emailOutbox)
    .values({
      to: input.to,
      subject: input.subject,
      html: input.html,
      status: 'pending',
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
    await db.update(emailOutbox).set({ status: 'sent' }).where(eq(emailOutbox.id, id))
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
    return dead ? 'failed' : 'pending'
  }
}

/** Processes pending outbox rows (scheduler + manual retry). */
export async function processEmailOutbox(limit = 50): Promise<number> {
  const now = new Date()
  const rows = await db
    .select({ id: emailOutbox.id })
    .from(emailOutbox)
    .where(
      and(
        eq(emailOutbox.status, 'pending'),
        lt(emailOutbox.attempts, MAX_EMAIL_ATTEMPTS),
        lte(emailOutbox.nextAttemptAt, now)
      )
    )
    .limit(limit)

  let delivered = 0
  for (const { id } of rows) {
    if ((await tryDeliverOutboxRow(id)) === 'sent') delivered += 1
  }
  return delivered
}
