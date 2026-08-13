import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import { sql } from 'drizzle-orm'
import { db } from './db/index.js'
import { figmaRouter } from './routes/figma.js'
import { authRouter } from './routes/auth.js'
import { customerRouter } from './routes/customer.js'
import { dealerRouter } from './routes/dealer.js'
import { adminRouter } from './routes/admin.js'
import { uploadsRouter, ensureUploadDir } from './routes/uploads.js'
import { paymentsRouter } from './routes/payments.js'
import { skipcashWebhookRouter } from './routes/skipcash-webhook.js'
import { uploadRoot } from './storage/index.js'

const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
]

export function createApp() {
  const app = express()

  app.set('trust proxy', 1)
  app.use(helmet({ contentSecurityPolicy: false }))

  const corsOrigins = (process.env.CORS_ORIGINS || defaultOrigins.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  app.use(
    cors({
      origin: corsOrigins,
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
    // Skip in tests and local development so demo login isn't blocked by retries.
    skip: () => process.env.VITEST === 'true' || process.env.NODE_ENV !== 'production',
  })
  app.use('/api/auth/login', authRateLimit)
  app.use('/api/auth/signup', authRateLimit)
  app.use('/api/auth/forgot-password', authRateLimit)

  ensureUploadDir()
  if (process.env.UPLOAD_DRIVER !== 'blob') {
    app.use('/uploads', express.static(uploadRoot()))
  }

  app.get('/health', async (_req, res) => {
    try {
      await db.execute(sql`SELECT 1`)
      res.json({ status: 'ok', message: 'CarFlow Backend API', db: 'connected' })
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
  app.use('/api/figma', figmaRouter)

  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ) => {
      console.error(err)
      const status = err.status || 500
      const message =
        process.env.NODE_ENV === 'production' && status >= 500
          ? 'Internal server error'
          : err.message || 'Internal server error'
      res.status(status).json({ error: message })
    }
  )

  return app
}
