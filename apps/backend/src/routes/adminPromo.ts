import { desc, eq } from 'drizzle-orm'
import { Router } from 'express'
import { db } from '../db/index.js'
import { promoCodes } from '../db/schema.js'
import { requireFullAdmin, type AuthedRequest } from '../middleware/auth.js'
import { logAuditSafe } from '../services/audit.js'
import { mapPromoCode } from '../services/promoCodes.js'
import { asyncHandler } from '../utils/http.js'
import { parseBody } from '../validation/parse.js'
import { adminCreatePromoSchema, adminPatchPromoSchema } from '../validation/schemas.js'

export const adminPromoRouter = Router()

adminPromoRouter.get(
  '/promo-codes',
  requireFullAdmin,
  asyncHandler(async (_req, res) => {
    const rows = await db.select().from(promoCodes).orderBy(desc(promoCodes.createdAt))
    res.json({ items: rows.map(mapPromoCode) })
  })
)

adminPromoRouter.post(
  '/promo-codes',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(adminCreatePromoSchema, req, res)
    if (!body) return

    const [row] = await db
      .insert(promoCodes)
      .values({
        code: body.code,
        discountType: body.discountType,
        discountValue: String(body.discountValue),
        minTermMonths: body.minTermMonths,
        maxUses: body.maxUses ?? null,
        perCustomerLimit: body.perCustomerLimit,
        firstInvoiceOnly: body.firstInvoiceOnly,
        validFrom: body.validFrom ?? null,
        validUntil: body.validUntil ?? null,
        active: body.active,
      })
      .returning()
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'promo.create',
      entityType: 'promo_code',
      entityId: row.id,
      after: mapPromoCode(row),
    })
    res.status(201).json(mapPromoCode(row))
  })
)

adminPromoRouter.patch(
  '/promo-codes/:id',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(adminPatchPromoSchema, req, res)
    if (!body) return

    const [before] = await db.select().from(promoCodes).where(eq(promoCodes.id, req.params.id)).limit(1)
    if (!before) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const patch: Record<string, unknown> = {}
    if (body.discountType !== undefined) patch.discountType = body.discountType
    if (body.discountValue !== undefined) patch.discountValue = String(body.discountValue)
    if (body.minTermMonths !== undefined) patch.minTermMonths = body.minTermMonths
    if (body.maxUses !== undefined) patch.maxUses = body.maxUses
    if (body.perCustomerLimit !== undefined) patch.perCustomerLimit = body.perCustomerLimit
    if (body.firstInvoiceOnly !== undefined) patch.firstInvoiceOnly = body.firstInvoiceOnly
    if (body.validFrom !== undefined) patch.validFrom = body.validFrom
    if (body.validUntil !== undefined) patch.validUntil = body.validUntil
    if (body.active !== undefined) patch.active = body.active
    if (Object.keys(patch).length === 0) {
      res.status(400).json({ error: 'No fields to update' })
      return
    }
    const [row] = await db
      .update(promoCodes)
      .set(patch as typeof promoCodes.$inferInsert)
      .where(eq(promoCodes.id, req.params.id))
      .returning()
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'promo.update',
      entityType: 'promo_code',
      entityId: row.id,
      before: mapPromoCode(before),
      after: mapPromoCode(row),
    })
    res.json(mapPromoCode(row))
  })
)

adminPromoRouter.delete(
  '/promo-codes/:id',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const [before] = await db.select().from(promoCodes).where(eq(promoCodes.id, req.params.id)).limit(1)
    if (!before) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    const [row] = await db
      .update(promoCodes)
      .set({ active: false })
      .where(eq(promoCodes.id, req.params.id))
      .returning()
    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'promo.disable',
      entityType: 'promo_code',
      entityId: row.id,
      before: mapPromoCode(before),
      after: mapPromoCode(row),
    })
    res.json(mapPromoCode(row))
  })
)
