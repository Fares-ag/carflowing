import path from 'path'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import { sql } from 'drizzle-orm'
import express from 'express'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { db } from './db/index.js'
import { adminRouter } from './routes/admin.js'
import { authRouter } from './routes/auth.js'
import { customerRouter } from './routes/customer.js'
import { dealerRouter } from './routes/dealer.js'
import { paymentsRouter } from './routes/payments.js'
import { skipcashWebhookRouter } from './routes/skipcash-webhook.js'
import { uploadsRouter, ensureUploadDir } from './routes/uploads.js'
import { uploadRoot } from './storage/index.js'
import { getJobsHealthMetrics } from './services/healthMetrics.js'
import { helmetContentSecurityPolicyOptions } from './utils/contentSecurityPolicy.js'
import { restrictiveContentTypeForPath, setAttachmentResponseHeaders } from './utils/uploadContent.js'
import { captureException, setupSentryExpressErrorHandler } from './utils/observability.js'
import { logStructured, requestContextMiddleware } from './utils/requestContext.js'
import { skipRateLimitInTests } from './utils/rateLimit.js'

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
]

/** Merge explicit CORS_ORIGINS with CUSTOMER/DEALER/ADMIN app URLs so prod domains stay in sync. */
export function resolveCorsOrigins(): string[] {
  const explicit = (process.env.CORS_ORIGINS || defaultOrigins.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const appUrls = [process.env.CUSTOMER_APP_URL, process.env.DEALER_APP_URL, process.env.ADMIN_APP_URL]
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s))
  return [...new Set([...explicit, ...appUrls])]
}

export function createApp() {
  const app = express()

  app.set('trust proxy', 1)
  app.use(requestContextMiddleware)
  app.use(
    helmet({
      contentSecurityPolicy: helmetContentSecurityPolicyOptions(),
    })
  )

  app.use(
    cors({
      origin: resolveCorsOrigins(),
      credentials: true,
    })
  )
  app.use(express.json({ limit: '2mb' }))
  app.use(cookieParser())

  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipRateLimitInTests,
  })
  app.use('/api/auth/login', authRateLimit)
  app.use('/api/auth/signup', authRateLimit)
  app.use('/api/auth/forgot-password', authRateLimit)
  app.use('/api/auth/resend-verification', authRateLimit)
  app.use('/api/auth/2fa/verify-login', authRateLimit)

  const paymentRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipRateLimitInTests,
  })
  app.use('/api/payments/skipcash/create-intent', paymentRateLimit)
  app.use('/api/payments/skipcash/invoice-intent', paymentRateLimit)

  const uploadRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 40,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipRateLimitInTests,
  })
  app.use('/api/uploads', uploadRateLimit)

  const mutationRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    skip: skipRateLimitInTests,
  })
  app.use('/api/admin/payments/:id/refund', mutationRateLimit)
  app.use('/api/customer/booking-requests', mutationRateLimit)

  ensureUploadDir()
  if (process.env.UPLOAD_DRIVER !== 'blob') {
    // Never expose identity documents via static file serving.
    const secureStatic = (root: string) =>
      express.static(root, {
        setHeaders(res, filePath) {
          setAttachmentResponseHeaders(res, filePath, restrictiveContentTypeForPath(filePath))
        },
      })
    app.use('/uploads/vehicle-images', secureStatic(path.join(uploadRoot(), 'vehicle-images')))
    app.use('/uploads/user-avatars', secureStatic(path.join(uploadRoot(), 'user-avatars')))
  }

  app.get('/health/live', (_req, res) => {
    res.status(200).json({ status: 'ok' })
  })

  app.get('/health', async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`)
      const { lastJobsSweepAt, stuckPendingCount } = await getJobsHealthMetrics()
      res.json({
        status: 'ok',
        message: 'CarFlow Backend API',
        db: 'connected',
        lastJobsSweepAt: lastJobsSweepAt?.toISOString() ?? null,
        stuckPendingCount,
      })
    } catch {
      res.status(503).json({ status: 'error', message: 'CarFlow Backend API', db: 'disconnected' })
    }
  })

  app.use('/api/auth', authRouter)
  app.use('/api/customer', customerRouter)
  app.use('/api/dealer', dealerRouter)
  app.use('/api/admin', adminRouter)
  app.use('/api/uploads', uploadsRouter)
  app.use('/api/payments', paymentsRouter)
  app.use('/api/payments/skipcash', skipcashWebhookRouter)
  /** Portal-compatible paths: /skipcash-pay/callback and /skipcash-pay/return */
  app.use('/skipcash-pay', skipcashWebhookRouter)

  if (process.env.VITEST === 'true') {
    app.get('/__test__/throw', () => {
      throw new Error('observability test error')
    })
  }

  setupSentryExpressErrorHandler(app)

  app.use(
    (
      err: any,
      req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      const status = err.status || 500
      logStructured('error', 'http.unhandled_error', {
        requestId: req.requestId,
        status,
        message: err instanceof Error ? err.message : String(err),
      })
      if (status >= 500) {
        captureException(err, { requestId: req.requestId, status })
      }
      const message =
        process.env.NODE_ENV === 'production' && status >= 500
          ? 'Internal server error'
          : err.message || 'Internal server error'
      res.status(status).json({ error: message })
    }
  )

  return app
}
