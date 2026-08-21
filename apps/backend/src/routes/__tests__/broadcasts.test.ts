import { and, eq } from 'drizzle-orm'
import type { Express } from 'express'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { broadcasts, notifications, profiles } from '../../db/schema.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

describe('Admin broadcasts', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('BCAST-01: preview returns dealer recipient count', async () => {
    await seedFixtures()
    const { agent } = await loginAs(app, 'admin@test.dev', 'admin')

    const preview = await agent.get('/api/admin/broadcasts/preview').query({ segment: 'all_dealers' })
    expect(preview.status).toBe(200)
    expect(preview.body.recipientCount).toBe(2)
  })

  it('BCAST-02: admin broadcast to all dealers fans out in-app notifications and records sent_count', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const sent = await agent.post('/api/admin/broadcasts').send({
      segment: 'all_dealers',
      subject: 'Platform maintenance tonight',
      body: 'Dealer portal may be unavailable from 11pm–1am.',
      channels: { inApp: true, email: false },
    })
    expect(sent.status).toBe(201)
    expect(sent.body.sentCount).toBe(2)

    const dealerNotifications = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, fixtures.dealer.id))
    expect(dealerNotifications).toHaveLength(1)
    expect(dealerNotifications[0]?.title).toBe('Platform maintenance tonight')

    const dealer2Notifications = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, fixtures.dealer2.id))
    expect(dealer2Notifications).toHaveLength(1)

    const [record] = await db.select().from(broadcasts).where(eq(broadcasts.id, sent.body.id)).limit(1)
    expect(record?.sentCount).toBe(2)

    const audit = await agent.get('/api/admin/audit-logs').query({ page: 1, pageSize: 20 })
    expect(audit.body.items.some((row: { action: string }) => row.action === 'broadcast.send')).toBe(true)

    const list = await agent.get('/api/admin/broadcasts')
    expect(list.body.items).toHaveLength(1)
  })

  it('BCAST-03: rejects broadcast with no channels', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const res = await agent.post('/api/admin/broadcasts').send({
      segment: 'all_customers',
      subject: 'Test',
      body: 'Hello',
      channels: { inApp: false, email: false },
    })
    expect(res.status).toBe(400)
  })
})
