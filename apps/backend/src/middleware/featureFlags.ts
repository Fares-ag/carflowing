import type { RequestHandler } from 'express'
import {
  areCheckoutEnabled,
  areDealerSignupsEnabled,
  areOnlinePaymentsEnabled,
  areSignupsEnabled,
} from '../services/appSettings.js'
import { asyncHandler } from '../utils/http.js'

function respondUnavailable(res: import('express').Response, message: string): void {
  res.status(503).json({ error: message, unavailable: true })
}

export const requireOnlinePaymentsEnabled: RequestHandler = asyncHandler(async (_req, res, next) => {
  if (!(await areOnlinePaymentsEnabled())) {
    respondUnavailable(res, 'Online payments are temporarily unavailable')
    return
  }
  next()
})

export const requireCheckoutEnabled: RequestHandler = asyncHandler(async (_req, res, next) => {
  if (!(await areCheckoutEnabled())) {
    respondUnavailable(res, 'Checkout is temporarily unavailable')
    return
  }
  next()
})

export const requireCustomerSignupsEnabled: RequestHandler = asyncHandler(async (_req, res, next) => {
  if (!(await areSignupsEnabled())) {
    respondUnavailable(res, 'Signups are temporarily unavailable')
    return
  }
  next()
})

export const requireDealerSignupsEnabled: RequestHandler = asyncHandler(async (_req, res, next) => {
  if (!(await areDealerSignupsEnabled())) {
    respondUnavailable(res, 'Dealer signups are temporarily unavailable')
    return
  }
  next()
})
