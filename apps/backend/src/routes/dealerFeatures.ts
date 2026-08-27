import { and, count, desc, eq, sql } from 'drizzle-orm'
import { Router } from 'express'
import { db } from '../db/index.js'
import { mapPlan } from '../db/mappers.js'
import {
  commissionLedger,
  maintenanceRecords,
  payouts,
  plans,
  vehicles,
} from '../db/schema.js'
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js'
import {
  cancelDealerSubscription,
  changeDealerPlan,
  getDealerSubscription,
  getDealerVehicleQuota,
  listDealerInvoices,
  listDealerPlans,
  mapDealerInvoice,
  mapDealerPlan,
  mapDealerSubscription,
} from '../services/dealerBilling.js'
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

/** Dealer subscription tiers actually sold (dealer_plans), cheapest first. */
dealerFeaturesRouter.get(
  '/billing/plans',
  asyncHandler(async (_req, res) => {
    const rows = await listDealerPlans()
    res.json(rows.map(mapDealerPlan))
  })
)

/** Current dealer subscription plus the listing headroom it grants. */
dealerFeaturesRouter.get(
  '/billing/subscription',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const current = await getDealerSubscription(db, dealer.id)
    const quota = await getDealerVehicleQuota(dealer.id)
    res.json({
      subscription: current ? mapDealerSubscription(current.subscription, current.plan) : null,
      plan: current ? mapDealerPlan(current.plan) : null,
      quota,
    })
  })
)

/** Invoice history — same shape convention as the customer invoice list. */
dealerFeaturesRouter.get(
  '/billing/invoices',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const rows = await listDealerInvoices(db, dealer.id)
    res.json(rows.map((r) => mapDealerInvoice(r.invoice, r.planName)))
  })
)

/**
 * Plan change. Never free: upgrading raises an open invoice that must be paid
 * within the billing grace window or the dealer walks down to the free tier
 * (services/dealerBilling.ts documents the full policy).
 */
dealerFeaturesRouter.patch(
  '/subscription/plan',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { planId, planCode } = req.body as { planId?: string; planCode?: string }
    if (!planId && !planCode) {
      res.status(400).json({ error: 'planId is required' })
      return
    }
    const dealer = await getDealerOrThrow(req.user!.sub)
    const result = await changeDealerPlan({
      dealerId: dealer.id,
      planId,
      planCode,
      actorId: req.user!.sub,
    })
    const quota = await getDealerVehicleQuota(dealer.id)
    res.json({
      subscription: mapDealerSubscription(result.subscription, result.plan),
      plan: mapDealerPlan(result.plan),
      invoice: result.invoice ? mapDealerInvoice(result.invoice, result.plan.name) : null,
      change: result.change,
      deactivatedVehicles: result.deactivatedVehicles,
      quota,
    })
  })
)

/** Cancellation is scheduled at a billing boundary, never mid-period. */
dealerFeaturesRouter.post(
  '/subscription/cancel',
  asyncHandler(async (req: AuthedRequest, res) => {
    const dealer = await getDealerOrThrow(req.user!.sub)
    const result = await cancelDealerSubscription({ dealerId: dealer.id, actorId: req.user!.sub })
    res.json({
      subscription: mapDealerSubscription(result.subscription, result.plan),
      plan: mapDealerPlan(result.plan),
      effectiveDate: result.effectiveDate,
    })
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
