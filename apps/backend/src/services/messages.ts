import { and, count, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { mapMessage } from '../db/mappers.js'
import {
  bookingRequests,
  dealers,
  messages,
  profiles,
  rentals,
  vehicles,
} from '../db/schema.js'
import type { DbOrTx } from './audit.js'
import { dealerCanAccessCustomerDocuments } from './documentAccess.js'
import { notifyUser } from './notify.js'

export const THREAD_TAG_RE = /^\[cf:(rental|booking):([0-9a-f-]{36})\]/i

export function buildThreadSubject(kind: 'rental' | 'booking', id: string, label?: string): string {
  const title = label?.trim() || (kind === 'rental' ? 'Rental conversation' : 'Booking conversation')
  return `[cf:${kind}:${id}] ${title}`
}

export function threadTagFromSubject(subject: string): { kind: 'rental' | 'booking'; id: string } | null {
  const match = subject.match(THREAD_TAG_RE)
  if (!match) return null
  return { kind: match[1].toLowerCase() as 'rental' | 'booking', id: match[2] }
}

export function displaySubject(subject: string): string {
  return subject.replace(THREAD_TAG_RE, '').trim() || subject
}

export async function dealerCanMessageCustomer(dealerId: string, customerId: string): Promise<boolean> {
  return dealerCanAccessCustomerDocuments(dealerId, customerId)
}

export async function customerCanMessageDealer(customerId: string, dealerId: string): Promise<boolean> {
  const [rental] = await db
    .select({ id: rentals.id })
    .from(rentals)
    .where(
      and(
        eq(rentals.customerId, customerId),
        eq(rentals.dealerId, dealerId),
        inArray(rentals.status, ['reserved', 'active', 'past_due'])
      )
    )
    .limit(1)
  if (rental) return true

  const [booking] = await db
    .select({ id: bookingRequests.id })
    .from(bookingRequests)
    .innerJoin(vehicles, eq(bookingRequests.vehicleId, vehicles.id))
    .where(
      and(
        eq(bookingRequests.customerId, customerId),
        eq(vehicles.dealerId, dealerId),
        eq(bookingRequests.status, 'pending'),
        eq(bookingRequests.awaitingPayment, false)
      )
    )
    .limit(1)
  return !!booking
}

export async function resolveDealerByOwnerUserId(ownerUserId: string) {
  const [dealer] = await db
    .select()
    .from(dealers)
    .where(eq(dealers.ownerUserId, ownerUserId))
    .limit(1)
  return dealer ?? null
}

export function messageListWhere(userId: string, folder: string) {
  if (folder === 'sent') {
    return and(eq(messages.fromUserId, userId), eq(messages.folder, 'sent'))
  }
  return and(eq(messages.toUserId, userId), eq(messages.folder, folder as 'inbox' | 'starred' | 'archived'))
}

export function threadMessagesWhere(userId: string, threadSubject: string) {
  const tag = threadTagFromSubject(threadSubject)
  const subjectMatch = tag
    ? sql`${messages.subject} LIKE ${`[cf:${tag.kind}:${tag.id}]%`}`
    : eq(messages.subject, threadSubject)

  return and(
    subjectMatch,
    or(
      and(eq(messages.fromUserId, userId), eq(messages.folder, 'sent')),
      and(eq(messages.toUserId, userId), eq(messages.folder, 'inbox'))
    )
  )
}

export function userOwnsMessage(userId: string, row: { fromUserId: string; toUserId: string; folder: string }) {
  if (row.folder === 'sent') return row.fromUserId === userId
  return row.toUserId === userId
}

interface SendMessageInput {
  fromUserId: string
  toUserId: string
  subject: string
  body: string
  executor?: DbOrTx
  notify?: boolean
}

export async function sendMessage(input: SendMessageInput) {
  const ex = input.executor ?? db
  const [sentRow] = await ex
    .insert(messages)
    .values({
      fromUserId: input.fromUserId,
      toUserId: input.toUserId,
      subject: input.subject,
      body: input.body,
      folder: 'sent',
    })
    .returning()
  await ex.insert(messages).values({
    fromUserId: input.fromUserId,
    toUserId: input.toUserId,
    subject: input.subject,
    body: input.body,
    folder: 'inbox',
  })

  if (input.notify !== false) {
    const [fromUser] = await ex
      .select({ name: profiles.name })
      .from(profiles)
      .where(eq(profiles.id, input.fromUserId))
      .limit(1)
    await notifyUser(ex, {
      userId: input.toUserId,
      type: 'info',
      title: 'New message',
      message: `${fromUser?.name ?? 'Someone'}: ${displaySubject(input.subject)}`,
    })
  }

  return mapMessage(sentRow)
}

export async function listUserMessages(
  userId: string,
  options: { folder: string; offset: number; limit: number }
) {
  const where = messageListWhere(userId, options.folder)
  const [totalRow] = await db.select({ value: count() }).from(messages).where(where)
  const rows = await db
    .select({ message: messages, fromUser: profiles })
    .from(messages)
    .leftJoin(profiles, eq(messages.fromUserId, profiles.id))
    .where(where)
    .orderBy(desc(messages.createdAt))
    .limit(options.limit)
    .offset(options.offset)

  return {
    total: Number(totalRow.value),
    items: rows.map((r) => ({
      ...mapMessage(r.message),
      fromName: r.fromUser?.name,
      fromEmail: r.fromUser?.email,
      fromRole: r.fromUser?.role,
    })),
  }
}

export async function listThreadMessages(userId: string, threadSubject: string) {
  const where = threadMessagesWhere(userId, threadSubject)
  const rows = await db
    .select({ message: messages, fromUser: profiles })
    .from(messages)
    .leftJoin(profiles, eq(messages.fromUserId, profiles.id))
    .where(where)
    .orderBy(messages.createdAt)

  const enriched = await Promise.all(
    rows.map(async (r) => {
      const [toUser] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, r.message.toUserId))
        .limit(1)
      return {
        ...mapMessage(r.message),
        fromName: r.fromUser?.name,
        fromEmail: r.fromUser?.email,
        toName: toUser?.name,
        toEmail: toUser?.email,
      }
    })
  )
  return enriched
}

export async function listMessageThreads(userId: string) {
  const rows = await db
    .select({ message: messages, fromUser: profiles })
    .from(messages)
    .leftJoin(profiles, eq(messages.fromUserId, profiles.id))
    .where(
      or(
        and(eq(messages.fromUserId, userId), eq(messages.folder, 'sent')),
        and(eq(messages.toUserId, userId), eq(messages.folder, 'inbox'))
      )
    )
    .orderBy(desc(messages.createdAt))
    .limit(500)

  const threads = new Map<
    string,
    {
      threadSubject: string
      displaySubject: string
      lastMessage: ReturnType<typeof mapMessage> & { fromName?: string; fromEmail?: string }
      unreadCount: number
      participantName?: string
      participantEmail?: string
    }
  >()

  for (const row of rows) {
    const tag = threadTagFromSubject(row.message.subject)
    const key = tag ? `${tag.kind}:${tag.id}` : row.message.subject
    if (threads.has(key)) continue

    const [counterpart] =
      row.message.fromUserId === userId
        ? await db.select().from(profiles).where(eq(profiles.id, row.message.toUserId)).limit(1)
        : [row.fromUser]

    const tagForUnread = threadTagFromSubject(row.message.subject)
    const unreadSubjectMatch = tagForUnread
      ? sql`${messages.subject} LIKE ${`[cf:${tagForUnread.kind}:${tagForUnread.id}]%`}`
      : eq(messages.subject, row.message.subject)
    const [unreadRow] = await db
      .select({ value: count() })
      .from(messages)
      .where(
        and(
          unreadSubjectMatch,
          eq(messages.toUserId, userId),
          eq(messages.folder, 'inbox'),
          eq(messages.read, false)
        )
      )

    threads.set(key, {
      threadSubject: row.message.subject,
      displaySubject: displaySubject(row.message.subject),
      lastMessage: {
        ...mapMessage(row.message),
        fromName: row.fromUser?.name,
        fromEmail: row.fromUser?.email,
      },
      unreadCount: Number(unreadRow?.value ?? 0),
      participantName: counterpart?.name,
      participantEmail: counterpart?.email,
    })
  }

  return Array.from(threads.values())
}

export async function resolveComposeSubject(input: {
  subject?: string
  rentalId?: string
  bookingRequestId?: string
  replyToMessageId?: string
  userId: string
}): Promise<string | null> {
  if (input.replyToMessageId) {
    const [original] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, input.replyToMessageId))
      .limit(1)
    if (!original) return null
    if (original.fromUserId !== input.userId && original.toUserId !== input.userId) return null
    return original.subject
  }
  if (input.rentalId) {
    return buildThreadSubject('rental', input.rentalId, input.subject)
  }
  if (input.bookingRequestId) {
    return buildThreadSubject('booking', input.bookingRequestId, input.subject)
  }
  if (input.subject?.trim()) return input.subject.trim()
  return null
}

export async function assertRentalContext(
  rentalId: string,
  dealerId: string,
  customerId: string
): Promise<boolean> {
  const [rental] = await db
    .select({ id: rentals.id })
    .from(rentals)
    .where(
      and(
        eq(rentals.id, rentalId),
        eq(rentals.dealerId, dealerId),
        eq(rentals.customerId, customerId)
      )
    )
    .limit(1)
  return !!rental
}

export async function assertBookingContext(
  bookingRequestId: string,
  dealerId: string,
  customerId: string
): Promise<boolean> {
  const [booking] = await db
    .select({ id: bookingRequests.id })
    .from(bookingRequests)
    .innerJoin(vehicles, eq(bookingRequests.vehicleId, vehicles.id))
    .where(
      and(
        eq(bookingRequests.id, bookingRequestId),
        eq(bookingRequests.customerId, customerId),
        eq(vehicles.dealerId, dealerId)
      )
    )
    .limit(1)
  return !!booking
}
