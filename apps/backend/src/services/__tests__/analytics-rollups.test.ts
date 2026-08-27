import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/index.js'
import { analyticsEvents, analyticsRollups } from '../../db/schema.js'
import { resetDb, seedFixtures } from '../../test/helpers.js'
import { addDays, todayISO } from '../../utils/dates.js'
import { purgeOldAnalyticsEvents, recordDailyRollups } from '../analyticsRollups.js'

describe('analytics rollups', () => {
  afterEach(async () => {
    vi.unstubAllEnvs()
    await resetDb()
  })

  it('ROLLUP-01: a no-argument run backfills every day since the last stored rollup', async () => {
    await seedFixtures()
    const today = todayISO()

    // Last thing the scheduler managed to write before it was down for 3 days.
    await db.insert(analyticsRollups).values({
      rollupDate: addDays(today, -3),
      metricKey: 'revenue',
      metricValue: '0',
      dimensions: {},
    })

    await recordDailyRollups()

    const rows = await db
      .select({ rollupDate: analyticsRollups.rollupDate })
      .from(analyticsRollups)
    const days = [...new Set(rows.map((row) => String(row.rollupDate)))].sort()
    expect(days).toEqual([addDays(today, -3), addDays(today, -2), addDays(today, -1), today])
  })

  it('ROLLUP-02: an explicit date still computes just that day', async () => {
    await seedFixtures()
    const day = addDays(todayISO(), -10)
    const written = await recordDailyRollups(day)
    expect(written).toBeGreaterThan(0)
    const rows = await db
      .select({ rollupDate: analyticsRollups.rollupDate })
      .from(analyticsRollups)
    expect([...new Set(rows.map((row) => String(row.rollupDate)))]).toEqual([day])
  })

  it('ROLLUP-03: raw events past the retention window are purged, recent ones kept', async () => {
    await seedFixtures()
    vi.stubEnv('ANALYTICS_EVENT_RETENTION_DAYS', '30')
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)

    await db.insert(analyticsEvents).values({
      eventType: 'signup',
      occurredAt: old,
      createdAt: old,
      properties: {},
    })
    await db.insert(analyticsEvents).values({ eventType: 'signup', properties: {} })

    expect(await purgeOldAnalyticsEvents()).toBe(1)
    expect(await db.select().from(analyticsEvents)).toHaveLength(1)
  })
})
