import { and, eq, gte, lt, sql } from 'drizzle-orm'
import { db } from '../db/index.js'
import { analyticsEvents, analyticsRollups, payments, rentals } from '../db/schema.js'
import { addDays, todayISO } from '../utils/dates.js'

const LIFECYCLE_METRIC_KEYS = [
  'activation_rate',
  'approval_sla_hours',
  'payment_success_rate',
  'churn_rate',
] as const

type LifecycleMetricKey = (typeof LIFECYCLE_METRIC_KEYS)[number]

export interface PlatformMetricsSummary {
  activationRate: number
  approvalSlaHours: number
  paymentSuccessRate: number
  churnRate: number
  counts: {
    signups: number
    emailVerified: number
    bookingsApproved: number
    paymentsCompleted: number
    paymentsFailed: number
    rentalsActivated: number
    cancelRequested: number
  }
}

function dayBounds(dateISO: string) {
  const dayStart = new Date(`${dateISO}T00:00:00.000Z`)
  const dayEnd = new Date(`${addDays(dateISO, 1)}T00:00:00.000Z`)
  return { dayStart, dayEnd }
}

async function countEventsInRange(eventType: string, dayStart: Date, dayEnd: Date): Promise<number> {
  const [row] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.eventType, eventType),
        gte(analyticsEvents.occurredAt, dayStart),
        lt(analyticsEvents.occurredAt, dayEnd)
      )
    )
  return Number(row?.value ?? 0)
}

async function avgApprovalSlaHours(dayStart: Date, dayEnd: Date): Promise<number> {
  const [row] = await db
    .select({
      avgMs: sql<string>`coalesce(avg((${analyticsEvents.properties}->>'approvalLatencyMs')::numeric), 0)`,
    })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.eventType, 'booking_approved'),
        gte(analyticsEvents.occurredAt, dayStart),
        lt(analyticsEvents.occurredAt, dayEnd)
      )
    )
  return Number(row?.avgMs ?? 0) / (1000 * 60 * 60)
}

async function paymentSuccessRateForRange(dayStart: Date, dayEnd: Date): Promise<number> {
  const [row] = await db
    .select({
      completed: sql<number>`count(*) filter (where ${payments.status} = 'completed')::int`,
      failed: sql<number>`count(*) filter (where ${payments.status} = 'failed')::int`,
    })
    .from(payments)
    .where(
      and(
        gte(payments.createdAt, dayStart),
        lt(payments.createdAt, dayEnd),
        sql`${payments.type} <> 'refund'`,
        sql`${payments.provider} = 'skipcash' OR ${payments.method} = 'card'`
      )
    )
  const completed = Number(row?.completed ?? 0)
  const failed = Number(row?.failed ?? 0)
  const total = completed + failed
  return total > 0 ? (completed / total) * 100 : 0
}

async function computeDayLifecycleMetrics(dateISO: string) {
  const { dayStart, dayEnd } = dayBounds(dateISO)
  const [signups, verified, cancels, activated] = await Promise.all([
    countEventsInRange('signup', dayStart, dayEnd),
    countEventsInRange('email_verified', dayStart, dayEnd),
    countEventsInRange('cancel_requested', dayStart, dayEnd),
    countEventsInRange('rental_activated', dayStart, dayEnd),
  ])
  const [approvalSlaHours, paymentSuccessRate] = await Promise.all([
    avgApprovalSlaHours(dayStart, dayEnd),
    paymentSuccessRateForRange(dayStart, dayEnd),
  ])
  const activationRate = signups > 0 ? (verified / signups) * 100 : 0
  const churnRate = activated > 0 ? (cancels / activated) * 100 : 0
  return {
    activation_rate: activationRate,
    approval_sla_hours: approvalSlaHours,
    payment_success_rate: paymentSuccessRate,
    churn_rate: churnRate,
  }
}

async function upsertRollupMetric(dateISO: string, metricKey: string, value: number) {
  const [existing] = await db
    .select({ id: analyticsRollups.id })
    .from(analyticsRollups)
    .where(and(eq(analyticsRollups.rollupDate, dateISO), eq(analyticsRollups.metricKey, metricKey)))
    .limit(1)
  if (existing) {
    await db
      .update(analyticsRollups)
      .set({ metricValue: String(value) })
      .where(eq(analyticsRollups.id, existing.id))
  } else {
    await db.insert(analyticsRollups).values({
      rollupDate: dateISO,
      metricKey,
      metricValue: String(value),
      dimensions: {},
    })
  }
}

export async function recordDailyRollups(dateISO = todayISO()): Promise<number> {
  const { dayStart, dayEnd } = dayBounds(dateISO)

  const [revenueRow] = await db
    .select({ value: sql<string>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(
      and(
        eq(payments.status, 'completed'),
        gte(payments.createdAt, dayStart),
        lt(payments.createdAt, dayEnd)
      )
    )

  const [rentalsRow] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(rentals)
    .where(and(gte(rentals.createdAt, dayStart), lt(rentals.createdAt, dayEnd)))

  const lifecycle = await computeDayLifecycleMetrics(dateISO)

  const metrics: Array<{ key: string; value: number }> = [
    { key: 'revenue', value: Number(revenueRow?.value ?? 0) },
    { key: 'new_rentals', value: Number(rentalsRow?.value ?? 0) },
    ...Object.entries(lifecycle).map(([key, value]) => ({ key, value })),
  ]

  for (const m of metrics) {
    await upsertRollupMetric(dateISO, m.key, m.value)
  }
  return metrics.length
}

export async function listRollupTrend(metricKey: string, days = 30) {
  const since = addDays(todayISO(), -(days - 1))
  const rows = await db
    .select()
    .from(analyticsRollups)
    .where(and(eq(analyticsRollups.metricKey, metricKey), gte(analyticsRollups.rollupDate, since)))
    .orderBy(analyticsRollups.rollupDate)
  return rows.map((r) => ({
    date: String(r.rollupDate),
    value: Number(r.metricValue),
  }))
}

export async function computePlatformMetrics(days = 30): Promise<PlatformMetricsSummary> {
  const since = addDays(todayISO(), -(days - 1))
  const sinceStart = new Date(`${since}T00:00:00.000Z`)
  const dayEnd = new Date(`${addDays(todayISO(), 1)}T00:00:00.000Z`)

  const [signups, verified, bookingsApproved, cancels, activated] = await Promise.all([
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(and(eq(analyticsEvents.eventType, 'signup'), gte(analyticsEvents.occurredAt, sinceStart))),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(
        and(eq(analyticsEvents.eventType, 'email_verified'), gte(analyticsEvents.occurredAt, sinceStart))
      ),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(
        and(eq(analyticsEvents.eventType, 'booking_approved'), gte(analyticsEvents.occurredAt, sinceStart))
      ),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(
        and(eq(analyticsEvents.eventType, 'cancel_requested'), gte(analyticsEvents.occurredAt, sinceStart))
      ),
    db
      .select({ value: sql<number>`count(*)::int` })
      .from(analyticsEvents)
      .where(
        and(eq(analyticsEvents.eventType, 'rental_activated'), gte(analyticsEvents.occurredAt, sinceStart))
      ),
  ])

  const signupCount = Number(signups[0]?.value ?? 0)
  const verifiedCount = Number(verified[0]?.value ?? 0)
  const activatedCount = Number(activated[0]?.value ?? 0)
  const cancelCount = Number(cancels[0]?.value ?? 0)

  const [approvalSlaHours, paymentRow] = await Promise.all([
    avgApprovalSlaHours(sinceStart, dayEnd),
    db
      .select({
        completed: sql<number>`count(*) filter (where ${payments.status} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${payments.status} = 'failed')::int`,
      })
      .from(payments)
      .where(
        and(
          gte(payments.createdAt, sinceStart),
          lt(payments.createdAt, dayEnd),
          sql`${payments.type} <> 'refund'`,
          sql`${payments.provider} = 'skipcash' OR ${payments.method} = 'card'`
        )
      ),
  ])

  const paymentsCompleted = Number(paymentRow[0]?.completed ?? 0)
  const paymentsFailed = Number(paymentRow[0]?.failed ?? 0)
  const paymentTotal = paymentsCompleted + paymentsFailed

  return {
    activationRate: signupCount > 0 ? (verifiedCount / signupCount) * 100 : 0,
    approvalSlaHours,
    paymentSuccessRate: paymentTotal > 0 ? (paymentsCompleted / paymentTotal) * 100 : 0,
    churnRate: activatedCount > 0 ? (cancelCount / activatedCount) * 100 : 0,
    counts: {
      signups: signupCount,
      emailVerified: verifiedCount,
      bookingsApproved: Number(bookingsApproved[0]?.value ?? 0),
      paymentsCompleted,
      paymentsFailed,
      rentalsActivated: activatedCount,
      cancelRequested: cancelCount,
    },
  }
}

export async function listLifecycleMetricTrends(days = 30) {
  const trends = await Promise.all(
    LIFECYCLE_METRIC_KEYS.map(async (key) => [key, await listRollupTrend(key, days)] as const)
  )
  return Object.fromEntries(trends) as Record<LifecycleMetricKey, Array<{ date: string; value: number }>>
}
