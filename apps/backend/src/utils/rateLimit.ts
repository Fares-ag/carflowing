import type { Request } from 'express'

/** Rate limiters run in every environment except Vitest (see createApp). */
export function skipRateLimitInTests(): boolean {
  return process.env.VITEST === 'true'
}

/** CORS middleware handles OPTIONS preflight; never rate-limit those requests. */
export function skipRateLimitForPreflight(req: Request): boolean {
  return req.method === 'OPTIONS'
}
