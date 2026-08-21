import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '../db/index.js'
import { broadcasts, dealers, invoices, profiles, rentals } from '../db/schema.js'
import { enqueueEmail } from './emailOutbox.js'
import { notifyUser } from './notify.js'

export const BROADCAST_SEGMENTS = [
  'all_customers',
  'all_dealers',
  'overdue_customers',
  'active_subscribers',
  'pending_dealers',
] as const

export type BroadcastSegment = (typeof BROADCAST_SEGMENTS)[number]

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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function broadcastBodyToHtml(body: string): string {
  return body
    .split('\n')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')
}

export async function resolveBroadcastRecipients(segment: BroadcastSegment): Promise<BroadcastRecipient[]> {
  switch (segment) {
    case 'all_customers': {
      return db
        .select({ userId: profiles.id, email: profiles.email, name: profiles.name })
        .from(profiles)
        .where(and(eq(profiles.role, 'customer'), eq(profiles.status, 'active')))
    }
    case 'all_dealers': {
      return db
        .select({ userId: dealers.ownerUserId, email: profiles.email, name: profiles.name })
        .from(dealers)
        .innerJoin(profiles, eq(dealers.ownerUserId, profiles.id))
        .where(eq(profiles.status, 'active'))
    }
    case 'pending_dealers': {
      return db
        .select({ userId: dealers.ownerUserId, email: profiles.email, name: profiles.name })
        .from(dealers)
        .innerJoin(profiles, eq(dealers.ownerUserId, profiles.id))
        .where(eq(dealers.status, 'pending'))
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
      return rows
    }
    default: {
      const _exhaustive: never = segment
      return _exhaustive
    }
  }
}

export async function countBroadcastRecipients(segment: BroadcastSegment): Promise<number> {
  const recipients = await resolveBroadcastRecipients(segment)
  return new Set(recipients.map((r) => r.userId)).size
}

async function deliverToRecipient(
  recipient: BroadcastRecipient,
  subject: string,
  body: string,
  channels: BroadcastChannels
): Promise<void> {
  if (channels.inApp) {
    await notifyUser(db, {
      userId: recipient.userId,
      type: 'info',
      title: subject,
      message: body,
    })
  }
  if (channels.email && recipient.email) {
    await enqueueEmail({
      to: recipient.email,
      subject,
      html: `<p>Hi ${escapeHtml(recipient.name)},</p>${broadcastBodyToHtml(body)}`,
    })
  }
}

export async function sendBroadcast(input: {
  segment: BroadcastSegment
  subject: string
  body: string
  channels: BroadcastChannels
  createdBy: string
}) {
  const rawRecipients = await resolveBroadcastRecipients(input.segment)
  const seen = new Set<string>()
  const recipients = rawRecipients.filter((recipient) => {
    if (seen.has(recipient.userId)) return false
    seen.add(recipient.userId)
    return true
  })

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE)
    await Promise.all(
      batch.map((recipient) =>
        deliverToRecipient(recipient, input.subject, input.body, input.channels)
      )
    )
  }

  const [row] = await db
    .insert(broadcasts)
    .values({
      segment: input.segment,
      subject: input.subject,
      body: input.body,
      channels: input.channels,
      sentCount: recipients.length,
      createdBy: input.createdBy,
    })
    .returning()

  return { row, sentCount: recipients.length }
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
