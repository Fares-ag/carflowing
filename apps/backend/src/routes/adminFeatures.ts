import crypto from 'crypto'
import { ADMIN_PORTAL_ROLES } from '@carflow/shared/types'
import { and, count, desc, eq, gte, ilike, inArray, isNull, lte, or } from 'drizzle-orm'
import { Router } from 'express'
import { revokeAllRefreshSessions } from '../auth/sessions.js'
import { db } from '../db/index.js'
import {
  jobRuns,
  paymentDisputes,
  payments,
  profiles,
  staffInvites,
  vehicles,
} from '../db/schema.js'
import {
  requireAdminPortal,
  requireFinanceCapability,
  requireFullAdmin,
  requireOpsCapability,
  type AuthedRequest,
} from '../middleware/auth.js'
import { listRollupTrend, recordDailyRollups, computePlatformMetrics, listLifecycleMetricTrends } from '../services/analyticsRollups.js'
import { logAuditSafe } from '../services/audit.js'
import { sendStaffInviteEmail } from '../services/mail.js'
import { runJobsOnce } from '../services/scheduler.js'
import { asyncHandler, paginated, parsePagination, attachUuidParamGuard } from '../utils/http.js'

const STAFF_PORTAL_ROLES = [...ADMIN_PORTAL_ROLES] as string[]

async function issueStaffInvite(params: {
  email: string
  name: string
  role: string
  invitedBy: string
}) {
  const normalized = params.email.trim().toLowerCase()
  const token = crypto.randomBytes(24).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const [row] = await db
    .insert(staffInvites)
    .values({
      email: normalized,
      name: params.name.trim(),
      role: params.role,
      tokenHash,
      invitedBy: params.invitedBy,
      expiresAt,
    })
    .returning()
  const adminUrl = process.env.ADMIN_APP_URL || 'http://localhost:5174'
  const inviteUrl = `${adminUrl}/login?staffInvite=${token}`
  await sendStaffInviteEmail({
    to: normalized,
    name: params.name.trim(),
    role: params.role,
    inviteUrl,
  })
  return { row, inviteUrl }
}

function mapStaffInvite(r: typeof staffInvites.$inferSelect) {
  return {
    id: r.id,
    email: r.email,
    name: r.name,
    role: r.role,
    expiresAt: r.expiresAt.toISOString(),
    acceptedAt: r.acceptedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }
}

export const adminFeaturesRouter = Router()
attachUuidParamGuard(adminFeaturesRouter)
adminFeaturesRouter.use(requireAdminPortal)

adminFeaturesRouter.get(
  '/jobs/runs',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const [totalRow] = await db.select({ value: count() }).from(jobRuns)
    const rows = await db
      .select()
      .from(jobRuns)
      .orderBy(desc(jobRuns.startedAt))
      .limit(limit)
      .offset(offset)
    res.json(
      paginated(
        rows.map((r) => ({
          id: r.id,
          startedAt: r.startedAt.toISOString(),
          completedAt: r.completedAt?.toISOString() ?? null,
          invoices: r.invoices,
          overdue: r.overdue,
          reminders: r.reminders,
          reconciled: r.reconciled,
          holdsReleased: r.holdsReleased,
          payouts: r.payouts,
          error: r.error ?? undefined,
        })),
        Number(totalRow.value),
        page,
        pageSize
      )
    )
  })
)

adminFeaturesRouter.post(
  '/jobs/run-once',
  requireOpsCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await runJobsOnce()
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'jobs.run_manual',
      entityType: 'job_run',
      after: result ?? { skipped: true },
    })
    res.json(result ?? { skipped: true })
  })
)

adminFeaturesRouter.get(
  '/analytics/rollups',
  asyncHandler(async (req, res) => {
    const days = Math.min(90, Number(req.query.days) || 30)
    const [revenue, rentals, metrics, metricTrends] = await Promise.all([
      listRollupTrend('revenue', days),
      listRollupTrend('new_rentals', days),
      computePlatformMetrics(days),
      listLifecycleMetricTrends(days),
    ])
    res.json({ revenue, rentals, metrics, metricTrends })
  })
)

adminFeaturesRouter.post(
  '/analytics/rollups/refresh',
  requireFullAdmin,
  asyncHandler(async (_req, res) => {
    const written = await recordDailyRollups()
    res.json({ written })
  })
)

adminFeaturesRouter.get(
  '/staff',
  requireFullAdmin,
  asyncHandler(async (_req, res) => {
    const rows = await db
      .select({
        id: profiles.id,
        email: profiles.email,
        name: profiles.name,
        role: profiles.role,
        status: profiles.status,
        createdAt: profiles.createdAt,
      })
      .from(profiles)
      .where(inArray(profiles.role, ['admin', 'finance', 'ops', 'support']))
      .orderBy(desc(profiles.createdAt))
    res.json({
      items: rows.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
        role: r.role,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
    })
  })
)

adminFeaturesRouter.get(
  '/staff/invites',
  requireFullAdmin,
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(staffInvites).orderBy(desc(staffInvites.createdAt)).limit(100)
    res.json({ items: rows.map(mapStaffInvite) })
  })
)

adminFeaturesRouter.post(
  '/staff/invites',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { email, name, role } = req.body as { email?: string; name?: string; role?: string }
    if (!email?.trim() || !name?.trim()) {
      res.status(400).json({ error: 'email and name are required' })
      return
    }
    if (!role || !STAFF_PORTAL_ROLES.includes(role)) {
      res.status(400).json({ error: `role must be one of: ${STAFF_PORTAL_ROLES.join(', ')}` })
      return
    }
    const normalized = email.trim().toLowerCase()
    const [existing] = await db.select().from(profiles).where(eq(profiles.email, normalized)).limit(1)
    if (existing) {
      res.status(409).json({ error: 'A user with this email already exists' })
      return
    }
    const [pendingInvite] = await db
      .select({ id: staffInvites.id })
      .from(staffInvites)
      .where(and(eq(staffInvites.email, normalized), isNull(staffInvites.acceptedAt)))
      .limit(1)
    if (pendingInvite) {
      res.status(409).json({ error: 'A pending invite already exists for this email' })
      return
    }
    const { row } = await issueStaffInvite({
      email: normalized,
      name: name.trim(),
      role,
      invitedBy: req.user!.sub,
    })
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'staff.invite',
      entityType: 'staff_invite',
      entityId: row.id,
      after: { email: normalized, role },
    })
    res.status(201).json(mapStaffInvite(row))
  })
)

adminFeaturesRouter.post(
  '/staff/invites/:id/resend',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const [invite] = await db.select().from(staffInvites).where(eq(staffInvites.id, req.params.id)).limit(1)
    if (!invite) {
      res.status(404).json({ error: 'Invite not found' })
      return
    }
    if (invite.acceptedAt) {
      res.status(409).json({ error: 'Invite has already been accepted' })
      return
    }
    const token = crypto.randomBytes(24).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const [row] = await db
      .update(staffInvites)
      .set({ tokenHash, expiresAt })
      .where(eq(staffInvites.id, invite.id))
      .returning()
    const adminUrl = process.env.ADMIN_APP_URL || 'http://localhost:5174'
    const inviteUrl = `${adminUrl}/login?staffInvite=${token}`
    await sendStaffInviteEmail({
      to: row.email,
      name: row.name,
      role: row.role,
      inviteUrl,
    })
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'staff.invite.resend',
      entityType: 'staff_invite',
      entityId: row.id,
      after: { email: row.email, role: row.role },
    })
    res.json(mapStaffInvite(row))
  })
)

adminFeaturesRouter.delete(
  '/staff/invites/:id',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const [invite] = await db.select().from(staffInvites).where(eq(staffInvites.id, req.params.id)).limit(1)
    if (!invite) {
      res.status(404).json({ error: 'Invite not found' })
      return
    }
    if (invite.acceptedAt) {
      res.status(409).json({ error: 'Cannot revoke an accepted invite' })
      return
    }
    await db.delete(staffInvites).where(eq(staffInvites.id, invite.id))
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'staff.invite.revoke',
      entityType: 'staff_invite',
      entityId: invite.id,
      before: { email: invite.email, role: invite.role },
    })
    res.status(204).end()
  })
)

adminFeaturesRouter.patch(
  '/staff/:id/deactivate',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    if (req.params.id === req.user!.sub) {
      res.status(409).json({ error: 'You cannot deactivate your own account' })
      return
    }
    const [before] = await db
      .select({
        id: profiles.id,
        email: profiles.email,
        name: profiles.name,
        role: profiles.role,
        status: profiles.status,
      })
      .from(profiles)
      .where(eq(profiles.id, req.params.id))
      .limit(1)
    if (!before) {
      res.status(404).json({ error: 'Staff member not found' })
      return
    }
    if (!STAFF_PORTAL_ROLES.includes(before.role)) {
      res.status(404).json({ error: 'Staff member not found' })
      return
    }
    if (before.status === 'suspended') {
      res.json({
        id: before.id,
        email: before.email,
        name: before.name,
        role: before.role,
        status: before.status,
      })
      return
    }
    if (before.role === 'admin') {
      const [countRow] = await db
        .select({ value: count() })
        .from(profiles)
        .where(and(eq(profiles.role, 'admin'), eq(profiles.status, 'active')))
      if (Number(countRow.value) <= 1) {
        res.status(409).json({ error: 'Cannot deactivate the only active admin' })
        return
      }
    }
    const [row] = await db
      .update(profiles)
      .set({ status: 'suspended' })
      .where(eq(profiles.id, req.params.id))
      .returning({
        id: profiles.id,
        email: profiles.email,
        name: profiles.name,
        role: profiles.role,
        status: profiles.status,
      })
    await revokeAllRefreshSessions(req.params.id)
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'staff.deactivate',
      entityType: 'profile',
      entityId: row.id,
      before: { status: before.status, role: before.role },
      after: { status: row.status, role: row.role },
    })
    res.json(row)
  })
)

adminFeaturesRouter.get(
  '/disputes',
  requireFinanceCapability,
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const status = req.query.status as string | undefined
    const where = status ? eq(paymentDisputes.status, status) : undefined
    const [totalRow] = where
      ? await db.select({ value: count() }).from(paymentDisputes).where(where)
      : await db.select({ value: count() }).from(paymentDisputes)
    const q = db.select().from(paymentDisputes).orderBy(desc(paymentDisputes.createdAt)).limit(limit).offset(offset)
    const rows = where ? await q.where(where) : await q
    res.json(
      paginated(
        rows.map((d) => ({
          id: d.id,
          paymentId: d.paymentId,
          customerId: d.customerId,
          dealerId: d.dealerId,
          status: d.status,
          reason: d.reason,
          amount: Number(d.amount),
          providerReference: d.providerReference ?? undefined,
          assignedTo: d.assignedTo ?? undefined,
          resolution: d.resolution ?? undefined,
          createdAt: d.createdAt.toISOString(),
          resolvedAt: d.resolvedAt?.toISOString() ?? null,
        })),
        Number(totalRow.value),
        page,
        pageSize
      )
    )
  })
)

adminFeaturesRouter.post(
  '/disputes',
  requireFinanceCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { paymentId, reason, amount, providerReference } = req.body as {
      paymentId?: string
      reason?: string
      amount?: number
      providerReference?: string
    }
    if (!paymentId || !reason?.trim()) {
      res.status(400).json({ error: 'paymentId and reason are required' })
      return
    }
    const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId)).limit(1)
    if (!payment) {
      res.status(404).json({ error: 'Payment not found' })
      return
    }
    const [row] = await db
      .insert(paymentDisputes)
      .values({
        paymentId,
        customerId: payment.customerId,
        dealerId: payment.dealerId,
        reason: reason.trim(),
        amount: String(amount ?? payment.amount),
        providerReference: providerReference?.trim() || null,
        assignedTo: req.user!.sub,
      })
      .returning()
    res.status(201).json({ id: row.id, status: row.status })
  })
)

adminFeaturesRouter.patch(
  '/disputes/:id',
  requireFinanceCapability,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { status, resolution, assignedTo } = req.body as {
      status?: string
      resolution?: string
      assignedTo?: string
    }
    const patch: Record<string, unknown> = {}
    if (status !== undefined) {
      if (!['open', 'investigating', 'won', 'lost', 'closed'].includes(status)) {
        res.status(400).json({ error: 'Invalid status' })
        return
      }
      patch.status = status
      if (status === 'won' || status === 'lost' || status === 'closed') {
        patch.resolvedAt = new Date()
      }
    }
    if (resolution !== undefined) patch.resolution = resolution
    if (assignedTo !== undefined) patch.assignedTo = assignedTo
    const [row] = await db
      .update(paymentDisputes)
      .set(patch as any)
      .where(eq(paymentDisputes.id, req.params.id))
      .returning()
    if (!row) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    res.json(row)
  })
)

adminFeaturesRouter.get(
  '/vehicles/search',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const q = String(req.query.q ?? '').trim()
    const status = req.query.status as string | undefined
    const category = req.query.category as string | undefined
    const dealerId = req.query.dealerId as string | undefined
    const minPrice = req.query.minPrice != null ? Number(req.query.minPrice) : undefined
    const maxPrice = req.query.maxPrice != null ? Number(req.query.maxPrice) : undefined
    const filters = []
    if (q) {
      filters.push(
        or(
          ilike(vehicles.name, `%${q}%`),
          ilike(vehicles.make, `%${q}%`),
          ilike(vehicles.model, `%${q}%`),
          ilike(vehicles.licensePlate, `%${q}%`)
        )
      )
    }
    if (status) filters.push(eq(vehicles.status, status as any))
    if (category) filters.push(eq(vehicles.category, category as any))
    if (dealerId) filters.push(eq(vehicles.dealerId, dealerId))
    if (minPrice != null && Number.isFinite(minPrice)) {
      filters.push(gte(vehicles.pricePerDay, String(minPrice)))
    }
    if (maxPrice != null && Number.isFinite(maxPrice)) {
      filters.push(lte(vehicles.pricePerDay, String(maxPrice)))
    }
    const where = filters.length ? and(...filters) : undefined
    const [totalRow] = where
      ? await db.select({ value: count() }).from(vehicles).where(where)
      : await db.select({ value: count() }).from(vehicles)
    const query = db.select().from(vehicles).orderBy(desc(vehicles.year)).limit(limit).offset(offset)
    const rows = where ? await query.where(where) : await query
    const { mapVehicle } = await import('../db/mappers.js')
    res.json(paginated(rows.map(mapVehicle), Number(totalRow.value), page, pageSize))
  })
)
