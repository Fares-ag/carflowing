import { Router } from 'express'
import { requireFullAdmin, type AuthedRequest } from '../middleware/auth.js'
import { logAuditSafe } from '../services/audit.js'
import {
  BROADCAST_SEGMENTS,
  countBroadcastRecipients,
  listBroadcasts,
  mapBroadcast,
  sendBroadcast,
  type BroadcastSegment,
} from '../services/broadcasts.js'
import { asyncHandler } from '../utils/http.js'
import { parseBody } from '../validation/parse.js'
import { adminCreateBroadcastSchema } from '../validation/schemas.js'

export const adminBroadcastRouter = Router()

adminBroadcastRouter.get(
  '/broadcasts/preview',
  requireFullAdmin,
  asyncHandler(async (req, res) => {
    const segment = String(req.query.segment ?? '')
    if (!BROADCAST_SEGMENTS.includes(segment as BroadcastSegment)) {
      res.status(400).json({ error: 'Invalid segment' })
      return
    }
    const recipientCount = await countBroadcastRecipients(segment as BroadcastSegment)
    res.json({ segment, recipientCount })
  })
)

adminBroadcastRouter.get(
  '/broadcasts',
  requireFullAdmin,
  asyncHandler(async (_req, res) => {
    const items = await listBroadcasts()
    res.json({ items })
  })
)

adminBroadcastRouter.post(
  '/broadcasts',
  requireFullAdmin,
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = parseBody(adminCreateBroadcastSchema, req, res)
    if (!body) return

    const { row, sentCount } = await sendBroadcast({
      segment: body.segment,
      subject: body.subject,
      body: body.body,
      channels: body.channels,
      createdBy: req.user!.sub,
    })

    await logAuditSafe({
      actorId: req.user!.sub,
      actorRole: req.user!.role,
      action: 'broadcast.send',
      entityType: 'broadcast',
      entityId: row.id,
      after: {
        segment: body.segment,
        subject: body.subject,
        sentCount,
        channels: body.channels,
      },
    })

    res.status(201).json(mapBroadcast(row))
  })
)
