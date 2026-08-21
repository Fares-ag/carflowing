import { and, count, desc, eq, lt, ne } from 'drizzle-orm'
import { db } from '../db/index.js'
import { appSettings, payments } from '../db/schema.js'

const STUCK_PENDING_MINUTES = 30

export async function countStuckPendingPayments(): Promise<number> {
  const stuckCutoff = new Date(Date.now() - STUCK_PENDING_MINUTES * 60 * 1000)
  const [row] = await db
    .select({ value: count() })
    .from(payments)
    .where(
      and(
        ne(payments.type, 'refund'),
        eq(payments.status, 'pending'),
        lt(payments.createdAt, stuckCutoff)
      )
    )
  return Number(row?.value ?? 0)
}

export async function getLastJobsSweepAt(): Promise<Date | null> {
  const [row] = await db
    .select({ lastJobsSweepAt: appSettings.lastJobsSweepAt })
    .from(appSettings)
    .orderBy(desc(appSettings.updatedAt))
    .limit(1)
  return row?.lastJobsSweepAt ?? null
}

export async function getJobsHealthMetrics(): Promise<{
  lastJobsSweepAt: Date | null
  stuckPendingCount: number
}> {
  const [lastJobsSweepAt, stuckPendingCount] = await Promise.all([
    getLastJobsSweepAt(),
    countStuckPendingPayments(),
  ])
  return { lastJobsSweepAt, stuckPendingCount }
}
