import { and, eq, inArray, isNotNull } from 'drizzle-orm'

import { db } from '../db/index.js'

import { invoices, invoiceReminderSends, profiles } from '../db/schema.js'

import { addDays, todayISO } from '../utils/dates.js'

import { getBillingGraceDays } from './appSettings.js'
import { sendEmail } from './mail.js'

import { notifyUser } from './notify.js'

function customerAppUrl(): string {
  return process.env.CUSTOMER_APP_URL || 'http://localhost:5173'
}

type ReminderStage = 'pre_due_3' | 'due_day' | 'overdue_grace' | 'overdue_escalation'

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

async function sendStageReminder(
  invoice: typeof invoices.$inferSelect,
  stage: ReminderStage,
  now: string
): Promise<boolean> {
  if (!(await isReminderStageDue(invoice, stage, now))) return false

  const [alreadySent] = await db
    .select({ id: invoiceReminderSends.id })
    .from(invoiceReminderSends)
    .where(and(eq(invoiceReminderSends.invoiceId, invoice.id), eq(invoiceReminderSends.stage, stage)))
    .limit(1)
  if (alreadySent) return false

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
    await sendEmail({
      to: customer.email,
      subject: copy.subject,
      html: `<p>Hi ${customer.name},</p>
<p>${copy.intro(amount, dueDate)}</p>
<p><a href="${customerAppUrl()}/my-booking">Pay online from My booking</a>, or pay at your dealer.</p>`,
    })
  }

  await db
    .insert(invoiceReminderSends)
    .values({ invoiceId: invoice.id, stage })
    .onConflictDoNothing()

  return true
}

/** Escalating payment reminders around invoice due dates (G-COLL-01). */
export async function sendInvoicePaymentReminders(now = todayISO()): Promise<number> {
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.ownerType, 'customer'),
        isNotNull(invoices.rentalId),
        inArray(invoices.status, ['due', 'overdue'])
      )
    )
    .limit(500)

  let sent = 0
  for (const invoice of rows) {
    for (const stage of [
      'pre_due_3',
      'due_day',
      'overdue_grace',
      'overdue_escalation',
    ] as ReminderStage[]) {
      if (await sendStageReminder(invoice, stage, now)) sent += 1
    }
  }
  return sent
}
