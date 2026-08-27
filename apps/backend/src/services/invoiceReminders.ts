import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm'

import { db } from '../db/index.js'

import { invoices, invoiceReminderSends, profiles } from '../db/schema.js'

import { addDays, todayISO } from '../utils/dates.js'
import { logStructured } from '../utils/requestContext.js'

import { getBillingGraceDays } from './appSettings.js'
import { escapeHtml, safeHref, sendEmail } from './mail.js'

import { notifyUser } from './notify.js'

function customerAppUrl(): string {
  return process.env.CUSTOMER_APP_URL || 'http://localhost:5173'
}

/** Invoices examined per keyset page; the sweep pages until the pool is exhausted. */
const REMINDER_PAGE_SIZE = 500

/** Safety valve so one sweep cannot run unbounded. */
function reminderSweepMaxInvoices(): number {
  const n = Number(process.env.INVOICE_REMINDER_MAX_PER_SWEEP)
  return Number.isFinite(n) && n >= 1 ? n : 5000
}

type ReminderStage = 'pre_due_3' | 'due_day' | 'overdue_grace' | 'overdue_escalation'

const REMINDER_STAGES: ReminderStage[] = [
  'pre_due_3',
  'due_day',
  'overdue_grace',
  'overdue_escalation',
]

const STAGE_COPY: Record<
  ReminderStage,
  { title: string; subject: string; intro: (amount: string, dueDate: string) => string }
> = {
  pre_due_3: {
    title: 'Payment due in 3 days',
    subject: 'Your CarFlow payment is due in 3 days',
    intro: (amount, dueDate) =>
      `Your subscription payment of <strong>QAR ${amount}</strong> is due on ${dueDate}.`,
  },
  due_day: {
    title: 'Payment due today',
    subject: 'Your CarFlow payment is due today',
    intro: (amount, dueDate) =>
      `Your subscription payment of <strong>QAR ${amount}</strong> is due today (${dueDate}).`,
  },
  overdue_grace: {
    title: 'Payment overdue',
    subject: 'Your CarFlow payment is overdue',
    intro: (amount) =>
      `Your subscription payment of <strong>QAR ${amount}</strong> is now overdue. Please pay as soon as possible to avoid service interruption.`,
  },
  overdue_escalation: {
    title: 'Urgent: payment still overdue',
    subject: 'Urgent: your CarFlow payment is still overdue',
    intro: (amount) =>
      `Your subscription payment of <strong>QAR ${amount}</strong> remains unpaid. Pay now to restore your subscription.`,
  },
}

/** Stage is eligible once its due window opens; dedup rows prevent repeat sends. */
export async function isReminderStageDue(
  invoice: typeof invoices.$inferSelect,
  stage: ReminderStage,
  now: string
): Promise<boolean> {
  if (!invoice.dueDate || invoice.status === 'paid' || invoice.status === 'void') return false
  const dueDate = String(invoice.dueDate)
  const grace = await getBillingGraceDays()

  if (stage === 'pre_due_3') {
    return invoice.status === 'due' && now >= addDays(dueDate, -3) && now < dueDate
  }
  if (stage === 'due_day') {
    return invoice.status === 'due' && now >= dueDate
  }
  if (stage === 'overdue_grace') {
    return (
      invoice.status === 'overdue' &&
      now >= addDays(dueDate, 1) &&
      now < addDays(dueDate, grace + 7)
    )
  }
  if (stage === 'overdue_escalation') {
    return invoice.status === 'overdue' && now >= addDays(dueDate, grace + 7)
  }
  return false
}

/**
 * Claims (invoice, stage) in invoice_reminder_sends BEFORE notifying, so two
 * overlapping sweeps — or two stages that both look eligible — can never send
 * the same reminder twice. The claim is rolled back if the notification itself
 * fails, so a transient mail outage still retries on the next sweep.
 */
async function claimReminderStage(invoiceId: string, stage: ReminderStage): Promise<string | null> {
  const [claim] = await db
    .insert(invoiceReminderSends)
    .values({ invoiceId, stage })
    .onConflictDoNothing()
    .returning({ id: invoiceReminderSends.id })
  return claim?.id ?? null
}

async function sendStageReminder(
  invoice: typeof invoices.$inferSelect,
  stage: ReminderStage,
  now: string
): Promise<boolean> {
  if (!(await isReminderStageDue(invoice, stage, now))) return false

  const claimId = await claimReminderStage(invoice.id, stage)
  if (!claimId) return false

  try {
    const [customer] = await db
      .select({ email: profiles.email, name: profiles.name })
      .from(profiles)
      .where(eq(profiles.id, invoice.ownerId))
      .limit(1)
    const copy = STAGE_COPY[stage]
    const amount = Number(invoice.amount).toFixed(2)
    const dueDate = String(invoice.dueDate)

    await notifyUser(db, {
      userId: invoice.ownerId,
      type: stage.startsWith('overdue') ? 'warning' : 'info',
      title: copy.title,
      message: `QAR ${amount} for invoice ${invoice.id.slice(0, 8)}. Pay from My booking.`,
    }).catch(() => undefined)

    if (customer?.email) {
      const payUrl = `${customerAppUrl()}/my-booking`
      await sendEmail({
        to: customer.email,
        subject: copy.subject,
        html: `<p>Hi ${escapeHtml(customer.name)},</p>
<p>${copy.intro(escapeHtml(amount), escapeHtml(dueDate))}</p>
<p><a href="${safeHref(payUrl)}">Pay online from My booking</a>, or pay at your dealer.</p>`,
      })
    }

    return true
  } catch (err) {
    // Release the claim so the reminder is retried rather than silently dropped.
    await db
      .delete(invoiceReminderSends)
      .where(eq(invoiceReminderSends.id, claimId))
      .catch(() => undefined)
    logStructured('error', 'invoice_reminder.send_failed', {
      invoiceId: invoice.id,
      stage,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

/**
 * Escalating payment reminders around invoice due dates (G-COLL-01).
 *
 * Pages oldest-due-date first through the whole delinquent pool (the previous
 * unordered LIMIT 500 meant customers past the 500th were never chased), and
 * sends at most one stage per invoice per sweep so a state change mid-sweep
 * cannot produce two emails for the same invoice.
 */
export async function sendInvoicePaymentReminders(now = todayISO()): Promise<number> {
  const maxInvoices = reminderSweepMaxInvoices()
  let cursor: { dueDate: string; id: string } | null = null
  let examined = 0
  let sent = 0

  while (examined < maxInvoices) {
    const page: Array<typeof invoices.$inferSelect> = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.ownerType, 'customer'),
          isNotNull(invoices.rentalId),
          isNotNull(invoices.dueDate),
          inArray(invoices.status, ['due', 'overdue']),
          ...(cursor
            ? [
                sql`(${invoices.dueDate}, ${invoices.id}) > (${cursor.dueDate}::date, ${cursor.id}::uuid)`,
              ]
            : [])
        )
      )
      .orderBy(asc(invoices.dueDate), asc(invoices.id))
      .limit(Math.min(REMINDER_PAGE_SIZE, maxInvoices - examined))

    if (page.length === 0) break

    for (const invoice of page) {
      for (const stage of REMINDER_STAGES) {
        if (await sendStageReminder(invoice, stage, now)) {
          sent += 1
          break
        }
      }
    }

    examined += page.length
    const lastRow = page[page.length - 1]
    cursor = { dueDate: String(lastRow.dueDate), id: lastRow.id }
    if (page.length < REMINDER_PAGE_SIZE) break
  }

  return sent
}
