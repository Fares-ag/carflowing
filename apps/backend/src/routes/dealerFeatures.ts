import { and, count, desc, eq, sql } from 'drizzle-orm'
import { Router } from 'express'
import { db } from '../db/index.js'
import { mapPlan, mapSubscription } from '../db/mappers.js'
import {
  commissionLedger,
  dealers,
  maintenanceRecords,
  payouts,
  plans,
  subscriptions,
  vehicles,
} from '../db/schema.js'
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js'
import { logAuditSafe } from '../services/audit.js'
import { asyncHandler, paginated, parsePagination } from '../utils/http.js'
import { getDealerOrThrow } from './dealer.js'

export const dealerFeaturesRouter = Router()
dealerFeaturesRouter.use(requireAuth, requireRole('dealer'))

dealerFeaturesRouter.get(
  '/plans',
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(plans).where(eq(plans.status, 'active')).orderBy(plans.priceMonthly)
    res.json(rows.map(mapPlan))
  })
)

dealerFeaturesRouter.get(
  '/payouts',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const { page, pageSize, offset, limit } = parsePagination(req.query as any)
    const where = eq(payouts.dealerId, dealer.id)
    const [totalRow] = await db.select({ value: count() }).from(payouts).where(where)
    const rows = await db
      .select()
      .from(payouts)
      .where(where)
      .orderBy(desc(payouts.createdAt))
      .limit(limit)
      .offset(offset)
    res.json(
      paginated(
        rows.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          status: p.status,
          periodStart: p.periodStart,
          periodEnd: p.periodEnd,
          paidAt: p.paidAt?.toISOString() ?? null,
          note: p.note ?? undefined,
          createdAt: p.createdAt.toISOString(),
        })),
        Number(totalRow.value),
        page,
        pageSize
      )
    )
  })
)

dealerFeaturesRouter.get(
  '/earnings',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const rows = await db
      .select({
        status: commissionLedger.status,
        gross: sql<string>`coalesce(sum(${commissionLedger.grossAmount}), 0)`,
        net: sql<string>`coalesce(sum(${commissionLedger.netAmount}), 0)`,
        commission: sql<string>`coalesce(sum(${commissionLedger.commissionAmount}), 0)`,
      })
      .from(commissionLedger)
      .where(eq(commissionLedger.dealerId, dealer.id))
      .groupBy(commissionLedger.status)
    const byStatus = Object.fromEntries(
      rows.map((r) => [
        r.status,
        {
          gross: Number(r.gross),
          net: Number(r.net),
          commission: Number(r.commission),
        },
      ])
    )
    const pendingPayouts = await db
      .select({ value: sql<string>`coalesce(sum(${payouts.amount}), 0)` })
      .from(payouts)
      .where(and(eq(payouts.dealerId, dealer.id), eq(payouts.status, 'pending')))
    res.json({
      byStatus,
      pendingPayoutTotal: Number(pendingPayouts[0]?.value ?? 0),
    })
  })
)

dealerFeaturesRouter.patch(
  '/subscription/plan',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { planId } = req.body as { planId?: string }
    if (!planId) {
      res.status(400).json({ error: 'planId is required' })
      return
    }
    const [plan] = await db
      .select()
      .from(plans)
      .where(and(eq(plans.id, planId), eq(plans.status, 'active')))
      .limit(1)
    if (!plan) {
      res.status(404).json({ error: 'Plan not found or inactive' })
      return
    }
    const dealer = await getDealerOrThrow(req.user!.sub)
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.ownerId, req.user!.sub), eq(subscriptions.ownerType, 'dealer')))
      .limit(1)
    let row
    if (sub) {
      [row] = await db
        .update(subscriptions)
        .set({ planId, status: 'active' })
        .where(eq(subscriptions.id, sub.id))
        .returning()
    } else {
      [row] = await db
        .insert(subscriptions)
        .values({
          ownerId: req.user!.sub,
          ownerType: 'dealer',
          planId,
          status: 'active',
        })
        .returning()
    }
    await db.update(dealers).set({ planId }).where(eq(dealers.id, dealer.id))
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: 'dealer',
      action: 'dealer.subscription.plan_change',
      entityType: 'subscription',
      entityId: row.id,
      after: { planId },
    })
    res.json(mapSubscription(row))
  })
)

dealerFeaturesRouter.post(
  '/subscription/cancel',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(and(eq(subscriptions.ownerId, req.user!.sub), eq(subscriptions.ownerType, 'dealer')))
      .limit(1)
    if (!sub) {
      res.status(404).json({ error: 'No active subscription' })
      return
    }
    const [row] = await db
      .update(subscriptions)
      .set({ status: 'canceled', endDate: new Date().toISOString().slice(0, 10) })
      .where(eq(subscriptions.id, sub.id))
      .returning()
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: 'dealer',
      action: 'dealer.subscription.cancel',
      entityType: 'subscription',
      entityId: sub.id,
    })
    res.json(mapSubscription(row))
  })
)

dealerFeaturesRouter.get(
  '/analytics/insights',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const [fleet] = await db
      .select({
        total: count(),
        available: sql<number>`count(*) filter (where ${vehicles.status} = 'available')`,
        rented: sql<number>`count(*) filter (where ${vehicles.status} = 'rented')`,
        maintenance: sql<number>`count(*) filter (where ${vehicles.status} = 'maintenance')`,
      })
      .from(vehicles)
      .where(eq(vehicles.dealerId, dealer.id))
    const [openMaintenanceRow] = await db
      .select({ value: count() })
      .from(maintenanceRecords)
      .where(and(eq(maintenanceRecords.dealerId, dealer.id), eq(maintenanceRecords.status, 'open')))
    const utilization =
      Number(fleet.total) > 0 ? Math.round((Number(fleet.rented) / Number(fleet.total)) * 100) : 0
    const insights: string[] = []
    if (utilization >= 80) {
      insights.push('Fleet utilization is high — consider adding inventory or scheduling maintenance.')
    } else if (utilization < 40) {
      insights.push('Several vehicles are idle — review pricing or run a promotion.')
    }
    if (Number(openMaintenanceRow?.value ?? 0) > 0) {
      insights.push(`${openMaintenanceRow?.value} open maintenance record(s) need attention.`)
    }
    res.json({
      fleet: {
        total: Number(fleet.total),
        available: Number(fleet.available),
        rented: Number(fleet.rented),
        maintenance: Number(fleet.maintenance),
        utilizationPct: utilization,
      },
      insights,
    })
  })
)
