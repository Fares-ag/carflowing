import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { profiles } from '../../db/schema.js'
import { bootstrapFirstAdmin, BootstrapAdminError } from '../../services/bootstrapAdmin.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

describe('Admin staff management', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  it('STAFF-01: bootstrap refuses when an admin already exists', async () => {
    const fixtures = await seedFixtures()
    await expect(
      bootstrapFirstAdmin({
        email: 'another-admin@test.dev',
        name: 'Another Admin',
        password: 'password123',
      })
    ).rejects.toBeInstanceOf(BootstrapAdminError)

    const admins = await db.select().from(profiles).where(eq(profiles.role, 'admin'))
    expect(admins.some((a) => a.email === fixtures.admin.email)).toBe(true)
  })

  it('STAFF-02: admin can invite admin, list staff, resend/revoke invite, and deactivate', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const staffList = await agent.get('/api/admin/staff')
    expect(staffList.status).toBe(200)
    expect(staffList.body.items.some((m: { email: string }) => m.email === fixtures.admin.email)).toBe(true)
    expect(staffList.body.items.some((m: { email: string }) => m.email === fixtures.finance.email)).toBe(true)

    const invited = await agent.post('/api/admin/staff/invites').send({
      email: 'new-admin@test.dev',
      name: 'New Admin',
      role: 'admin',
    })
    expect(invited.status).toBe(201)
    expect(invited.body.role).toBe('admin')

    const resend = await agent.post(`/api/admin/staff/invites/${invited.body.id}/resend`)
    expect(resend.status).toBe(200)

    const revoke = await agent.delete(`/api/admin/staff/invites/${invited.body.id}`)
    expect(revoke.status).toBe(204)

    const deactivate = await agent.patch(`/api/admin/staff/${fixtures.finance.id}/deactivate`)
    expect(deactivate.status).toBe(200)
    expect(deactivate.body.status).toBe('suspended')

    const audit = await agent.get('/api/admin/audit-logs').query({ page: 1, pageSize: 30 })
    const actions = audit.body.items.map((row: { action: string }) => row.action)
    expect(actions).toContain('staff.invite')
    expect(actions).toContain('staff.invite.resend')
    expect(actions).toContain('staff.invite.revoke')
    expect(actions).toContain('staff.deactivate')
  })

  it('STAFF-03: admin cannot deactivate themselves or the only active admin', async () => {
    const fixtures = await seedFixtures()
    const { agent } = await loginAs(app, fixtures.admin.email, 'admin')

    const self = await agent.patch(`/api/admin/staff/${fixtures.admin.id}/deactivate`)
    expect(self.status).toBe(409)
    expect(self.body.error).toMatch(/your own account/i)
  })
})
