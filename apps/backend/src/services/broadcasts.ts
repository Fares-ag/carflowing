import { createHmac, timingSafeEqual } from 'node:crypto'
import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  broadcasts,
  dealers,
  emailOutbox,
  invoices,
  profiles,
  rentals,
  userPreferences,
} from '../db/schema.js'
import { logStructured } from '../utils/requestContext.js'
import { enqueueEmail } from './emailOutbox.js'
import { escapeHtml, safeHref } from './mail.js'
import { notifyUser } from './notify.js'

export const BROADCAST_SEGMENTS = [
  'all_customers',
  'all_dealers',
  'overdue_customers',
  'active_subscribers',
  'pending_dealers',
] as const

export type BroadcastSegment = (typeof BROADCAST_SEGMENTS)[number]

/**
 * Marketing blasts require opt-in consent, carry an unsubscribe link and queue
 * behind transactional mail. Operational notices (outage windows, policy
 * changes) are transactional and go to every recipient of the segment.
 */
export type BroadcastKind = 'marketing' | 'transactional'

export interface BroadcastRecipient {
  userId: string
  email: string
  name: string
}

export interface BroadcastChannels {
  inApp: boolean
  email: boolean
}

const BATCH_SIZE = 25

function unsubscribeSecret(): string {
  return (
    process.env.UNSUBSCRIBE_SECRET ||
    process.env.JWT_ACCESS_SECRET ||
    'dev-unsubscribe-secret-change-me'
  )
}

/** Stateless unsubscribe token — no table needed, and it survives a re-send. */
export function buildUnsubscribeToken(userId: string): string {
  return createHmac('sha256', unsubscribeSecret()).update(`unsubscribe:${userId}`).digest('hex')
}

export function verifyUnsubscribeToken(userId: string, token: string): boolean {
  const expected = Buffer.from(buildUnsubscribeToken(userId))
  const actual = Buffer.from(String(token ?? ''))
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export function buildUnsubscribeUrl(userId: string): string {
  const base = (process.env.CUSTOMER_APP_URL || 'http://localhost:5173').replace(/\/+$/, '')
  return `${base}/unsubscribe?u=${encodeURIComponent(userId)}&t=${buildUnsubscribeToken(userId)}`
}

export function broadcastBodyToHtml(body: string): string {
  return body
    .split('\n')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')
}

/**
 * The `carflow-unsubscribe` class is the marker emailOutbox lifts back out to
 * build the List-Unsubscribe header at delivery time.
 */
function unsubscribeFooter(userId: string): string {
  const url = buildUnsubscribeUrl(userId)
  return `<hr/><p style="font-size:12px;color:#666">You receive CarFlow updates because you opted in. <a class="carflow-unsubscribe" href="${safeHref(url)}">Unsubscribe</a>.</p>`
}

export async function resolveBroadcastRecipients(segment: BroadcastSegment): Promise<BroadcastRecipient[]> {
  switch (segment) {
    case 'all_customers': {
      return db
        .select({ userId: profiles.id, email: profiles.email, name: profiles.name })
        .from(profiles)
        .where(and(eq(profiles.role, 'customer'), eq(profiles.status, 'active')))
        .orderBy(asc(profiles.id))
    }
    case 'all_dealers': {
      return db
        .select({ userId: dealers.ownerUserId, email: profiles.email, name: profiles.name })
        .from(dealers)
        .innerJoin(profiles, eq(dealers.ownerUserId, profiles.id))
        .where(eq(profiles.status, 'active'))
        .orderBy(asc(dealers.ownerUserId))
    }
    case 'pending_dealers': {
      return db
        .select({ userId: dealers.ownerUserId, email: profiles.email, name: profiles.name })
        .from(dealers)
        .innerJoin(profiles, eq(dealers.ownerUserId, profiles.id))
        .where(eq(dealers.status, 'pending'))
        .orderBy(asc(dealers.ownerUserId))
    }
    case 'overdue_customers': {
      const rows = await db
        .selectDistinct({
          userId: invoices.ownerId,
          email: profiles.email,
          name: profiles.name,
        })
        .from(invoices)
        .innerJoin(profiles, eq(invoices.ownerId, profiles.id))
        .where(
          and(
            eq(invoices.ownerType, 'customer'),
            eq(invoices.status, 'overdue'),
            eq(profiles.status, 'active')
          )
        )
        .orderBy(asc(invoices.ownerId))
      return rows
    }
    case 'active_subscribers': {
      const rows = await db
        .selectDistinct({
          userId: rentals.customerId,
          email: profiles.email,
          name: profiles.name,
        })
        .from(rentals)
        .innerJoin(profiles, eq(rentals.customerId, profiles.id))
        .where(
          and(inArray(rentals.status, ['active', 'past_due']), eq(profiles.status, 'active'))
        )
        .orderBy(asc(rentals.customerId))
      return rows
    }
    default: {
      const _exhaustive: never = segment
      return _exhaustive
    }
  }
}

/** Deterministic recipient list — the fan-out resumes by index, so order matters. */
async function orderedRecipients(segment: BroadcastSegment): Promise<BroadcastRecipient[]> {
  const raw = await resolveBroadcastRecipients(segment)
  const seen = new Set<string>()
  return raw
    .filter((recipient) => {
      if (seen.has(recipient.userId)) return false
      seen.add(recipient.userId)
      return true
    })
    .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))
}

export async function countBroadcastRecipients(segment: BroadcastSegment): Promise<number> {
  const recipients = await resolveBroadcastRecipients(segment)
  return new Set(recipients.map((r) => r.userId)).size
}

/**
 * Marketing email needs explicit consent (user_preferences.marketing_emails)
 * and skips the suppression list — addresses that already dead-lettered, which
 * is the closest thing to a bounce list the outbox can give us.
 */
async function emailEligibleUserIds(
  chunk: BroadcastRecipient[],
  kind: BroadcastKind
): Promise<Set<string>> {
  const withEmail = chunk.filter((r) => r.email)
  if (withEmail.length === 0) return new Set()

  const suppressedRows = await db
    .selectDistinct({ to: emailOutbox.to })
    .from(emailOutbox)
    .where(
      and(
        inArray(
          emailOutbox.to,
          withEmail.map((r) => r.email)
        ),
        eq(emailOutbox.status, 'failed')
      )
    )
  const suppressed = new Set(suppressedRows.map((row) => row.to))

  let consented: Set<string> | null = null
  if (kind === 'marketing') {
    const rows = await db
      .select({ userId: userPreferences.userId })
      .from(userPreferences)
      .where(
        and(
          inArray(
            userPreferences.userId,
            withEmail.map((r) => r.userId)
          ),
          eq(userPreferences.marketingEmails, true)
        )
      )
    consented = new Set(rows.map((row) => row.userId))
  }

  return new Set(
    withEmail
      .filter((r) => !suppressed.has(r.email) && (consented ? consented.has(r.userId) : true))
      .map((r) => r.userId)
  )
}

async function deliverToRecipient(
  recipient: BroadcastRecipient,
  subject: string,
  body: string,
  channels: BroadcastChannels,
  kind: BroadcastKind,
  emailAllowed: boolean
): Promise<void> {
  if (channels.inApp) {
    await notifyUser(db, {
      userId: recipient.userId,
      type: 'info',
      title: subject,
      message: body,
    })
  }
  if (channels.email && recipient.email && emailAllowed) {
    const footer = kind === 'marketing' ? unsubscribeFooter(recipient.userId) : ''
    await enqueueEmail({
      to: recipient.email,
      subject,
      html: `<p>Hi ${escapeHtml(recipient.name)},</p>${broadcastBodyToHtml(body)}${footer}`,
      priority: kind === 'marketing' ? 'marketing' : 'transactional',
    })
  }
}

/**
 * Fans out from `startIndex`, recording progress in broadcasts.sent_count after
 * every chunk so a restart mid-blast resumes instead of re-sending from zero.
 */
async function fanOutBroadcast(
  broadcastId: string,
  recipients: BroadcastRecipient[],
  input: { subject: string; body: string; channels: BroadcastChannels; kind: BroadcastKind },
  startIndex: number
): Promise<number> {
  let processed = startIndex
  for (let i = startIndex; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE)
    const emailAllowed = input.channels.email
      ? await emailEligibleUserIds(batch, input.kind)
      : new Set<string>()
    await Promise.all(
      batch.map((recipient) =>
        deliverToRecipient(
          recipient,
          input.subject,
          input.body,
          input.channels,
          input.kind,
          emailAllowed.has(recipient.userId)
        )
      )
    )
    processed = i + batch.length
    await db
      .update(broadcasts)
      .set({ sentCount: processed })
      .where(eq(broadcasts.id, broadcastId))
  }
  return processed
}

export async function sendBroadcast(input: {
  segment: BroadcastSegment
  subject: string
  body: string
  channels: BroadcastChannels
  createdBy: string
  kind?: BroadcastKind
}) {
  const kind = input.kind ?? 'marketing'
  const recipients = await orderedRecipients(input.segment)

  // The audit row is written BEFORE the fan-out: a crash mid-blast used to lose
  // the record entirely, so a restart re-sent the whole segment.
  const [created] = await db
    .insert(broadcasts)
    .values({
      segment: input.segment,
      subject: input.subject,
      body: input.body,
      channels: input.channels,
      sentCount: 0,
      createdBy: input.createdBy,
    })
    .returning()

  const sentCount = await fanOutBroadcast(
    created.id,
    recipients,
    { subject: input.subject, body: input.body, channels: input.channels, kind },
    0
  )

  const [row] = await db.select().from(broadcasts).where(eq(broadcasts.id, created.id)).limit(1)
  logStructured('info', 'broadcast.sent', {
    broadcastId: created.id,
    segment: input.segment,
    kind,
    sentCount,
  })
  return { row: row ?? { ...created, sentCount }, sentCount }
}

/**
 * Continues a blast that was interrupted (process restart, deploy). Recipients
 * are recomputed in the same deterministic order and the first sent_count of
 * them are skipped.
 */
export async function resumeBroadcast(
  broadcastId: string,
  kind: BroadcastKind = 'marketing'
): Promise<number> {
  const [row] = await db.select().from(broadcasts).where(eq(broadcasts.id, broadcastId)).limit(1)
  if (!row) return 0
  const recipients = await orderedRecipients(row.segment as BroadcastSegment)
  if (row.sentCount >= recipients.length) return 0
  return fanOutBroadcast(
    row.id,
    recipients,
    {
      subject: row.subject,
      body: row.body,
      channels: row.channels as BroadcastChannels,
      kind,
    },
    row.sentCount
  )
}

export function mapBroadcast(row: typeof broadcasts.$inferSelect) {
  return {
    id: row.id,
    segment: row.segment,
    subject: row.subject,
    body: row.body,
    channels: row.channels as BroadcastChannels,
    sentCount: row.sentCount,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
  }
}

export async function listBroadcasts(limit = 50) {
  const rows = await db.select().from(broadcasts).orderBy(desc(broadcasts.createdAt)).limit(limit)
  return rows.map(mapBroadcast)
}
