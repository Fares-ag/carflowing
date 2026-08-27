import type { NextFunction, Request, Response } from 'express'
import rateLimit, {
  ipKeyGenerator,
  type Options,
  type RateLimitRequestHandler,
  type ValueDeterminingMiddleware,
} from 'express-rate-limit'
import { ACCESS_COOKIE, verifyAccessToken } from '../auth/tokens.js'
import { logStructured } from './requestContext.js'

/**
 * Rate limiters run in every environment except an automated test harness.
 * Vitest sets VITEST itself; the Playwright suite boots the REAL server, so it
 * opts in explicitly via E2E_RELAX_RATE_LIMITS (without it the suite exhausts
 * the 20-login auth window and every later sign-in 429s).
 *
 * Neither switch is honoured when NODE_ENV=production, so a stray env var can
 * never disable abuse protection on a live deployment. Limiter behaviour itself
 * is covered by routes/__tests__/rate-limit.test.ts.
 */
export function skipRateLimitInTests(): boolean {
  if (process.env.NODE_ENV === 'production') return false
  return process.env.VITEST === 'true' || process.env.E2E_RELAX_RATE_LIMITS === 'true'
}

/** CORS middleware handles OPTIONS preflight; never rate-limit those requests. */
export function skipRateLimitForPreflight(req: Request): boolean {
  return req.method === 'OPTIONS'
}

/**
 * Production traffic is Browser -> Vercel rewrite -> Railway edge -> Express,
 * so two proxies append to X-Forwarded-For and `trust proxy` must be 2 for
 * req.ip to resolve to the real client instead of an egress IP shared by the
 * entire platform. Override with TRUST_PROXY_HOPS when the topology changes
 * (e.g. hitting Railway directly = 1, or an extra WAF in front of Vercel = 3).
 */
export function resolveTrustProxyHops(): number {
  const fallback = process.env.NODE_ENV === 'production' ? 2 : 1
  const raw = process.env.TRUST_PROXY_HOPS?.trim()
  if (!raw) return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 0) {
    logStructured('warn', 'http.trust_proxy_hops_invalid', { value: raw, fallback })
    return fallback
  }
  return parsed
}

/**
 * Keys limits on the authenticated user id when the request carries a valid
 * access cookie, so one shared proxy egress IP cannot collapse every customer
 * into a single bucket. Unauthenticated requests fall back to the IP, via
 * express-rate-limit's ipKeyGenerator — required so an IPv6 client cannot
 * sidestep the limit by rotating addresses inside its own /56.
 */
export async function rateLimitKey(req: Request): Promise<string> {
  const token = (req.cookies as Record<string, string> | undefined)?.[ACCESS_COOKIE]
  if (token) {
    try {
      const { sub } = await verifyAccessToken(token)
      if (sub) return `user:${sub}`
    } catch {
      // Expired or forged cookie: fall through to IP keying.
    }
  }
  return `ip:${ipKeyGenerator(req.ip ?? '')}`
}

/** "42 seconds" / "3 minutes" — how long until the client's window resets. */
export function retryAfterPhrase(resetTime: Date | undefined, windowMs: number): string {
  const remainingMs = resetTime ? resetTime.getTime() - Date.now() : windowMs
  const seconds = Math.max(1, Math.ceil(remainingMs / 1000))
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`
  const minutes = Math.ceil(seconds / 60)
  return `${minutes} minute${minutes === 1 ? '' : 's'}`
}

/**
 * express-rate-limit's default handler sends a plain-text body. Every other
 * error in this API is JSON `{ error }`, and the SPA error parser assumes it.
 */
export function rateLimitExceededHandler(
  req: Request,
  res: Response,
  _next: NextFunction,
  options: Options
): void {
  const info = (req as Request & { rateLimit?: { limit?: number; resetTime?: Date } }).rateLimit
  const wait = retryAfterPhrase(info?.resetTime, options.windowMs)
  logStructured('warn', 'http.rate_limited', {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    limit: info?.limit,
  })
  res.status(options.statusCode).json({ error: `Too many requests. Please try again in ${wait}.` })
}

/** Shared limiter shape: standard headers, user-or-IP key, JSON 429 body. */
export function createRateLimiter(config: {
  windowMs: number
  max: number
  skip: ValueDeterminingMiddleware<boolean>
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    handler: rateLimitExceededHandler,
    skip: config.skip,
  })
}
