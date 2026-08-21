import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { analyticsEvents } from '../../db/schema.js'
import { computePlatformMetrics, recordDailyRollups } from '../analyticsRollups.js'
import { trackAnalyticsEvent } from '../analyticsEvents.js'
import { resetDb, seedFixtures } from '../../test/helpers.js'

describe('analytics events & rollups', () => {
  it('records lifecycle events and computes platform metrics', async () => {
    await resetDb()
    const fixtures = await seedFixtures()

    await trackAnalyticsEvent(db, {
      eventType: 'signup',
      userId: fixtures.customer.id,
      entityType: 'profile',
      entityId: fixtures.customer.id,
    })
    await trackAnalyticsEvent(db, {
      eventType: 'email_verified',
      userId: fixtures.customer.id,
      entityType: 'profile',
      entityId: fixtures.customer.id,
    })
    await trackAnalyticsEvent(db, {
      eventType: 'booking_approved',
      userId: fixtures.customer.id,
      entityType: 'booking_request',
      entityId: fixtures.vehicles[0].id,
      properties: { approvalLatencyMs: 2 * 60 * 60 * 1000 },
    })
    await trackAnalyticsEvent(db, {
      eventType: 'rental_activated',
      userId: fixtures.customer.id,
      entityType: 'rental',
      entityId: fixtures.vehicles[0].id,
    })

    const rows = await db.select().from(analyticsEvents)
    expect(rows.some((r) => r.eventType === 'signup')).toBe(true)
    expect(rows.some((r) => r.eventType === 'email_verified')).toBe(true)

    const metrics = await computePlatformMetrics(30)
    expect(metrics.counts.signups).toBeGreaterThanOrEqual(1)
    expect(metrics.counts.emailVerified).toBeGreaterThanOrEqual(1)
    expect(metrics.activationRate).toBeGreaterThan(0)
    expect(metrics.approvalSlaHours).toBeGreaterThan(0)

    const rollupDate = new Date().toISOString().slice(0, 10)
    const written = await recordDailyRollups(rollupDate)
    expect(written).toBeGreaterThanOrEqual(6)
  })

  it('persists typed event names from shared taxonomy', async () => {
    await resetDb()
    await trackAnalyticsEvent(db, {
      eventType: 'complaint_opened',
      entityType: 'complaint',
      properties: { category: 'billing' },
    })
    const [row] = await db
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.eventType, 'complaint_opened'))
      .limit(1)
    expect(row?.eventType).toBe('complaint_opened')
  })
})
