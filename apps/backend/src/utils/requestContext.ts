import crypto from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'

export const REQUEST_ID_HEADER = 'x-request-id'

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string
  }
}

/** Attach a stable request id for structured logs and support correlation. */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(REQUEST_ID_HEADER)
  const requestId = incoming && incoming.length <= 128 ? incoming : crypto.randomUUID()
  req.requestId = requestId
  res.setHeader(REQUEST_ID_HEADER, requestId)
  next()
}

/**
 * Access logs are pure noise in Vitest output, so they are off under VITEST
 * unless ACCESS_LOG=true asks for them (the middleware's own tests do).
 */
export function accessLoggingEnabled(): boolean {
  if (process.env.ACCESS_LOG === 'true') return true
  if (process.env.ACCESS_LOG === 'false') return false
  return process.env.VITEST !== 'true'
}

/**
 * One structured line per completed request so the request id we already hand
 * back to the client is greppable server-side. Never logs bodies, headers,
 * cookies or query strings — those carry tokens and personal data.
 */
export function accessLogMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!accessLoggingEnabled()) {
    next()
    return
  }
  const startedAt = process.hrtime.bigint()
  // originalUrl minus the query string: query values can carry tokens.
  const path = req.originalUrl.split('?')[0]
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6
    const user = (req as Request & { user?: { sub?: string } }).user
    logStructured(res.statusCode >= 500 ? 'error' : 'info', 'http.request', {
      requestId: req.requestId,
      method: req.method,
      path,
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      userId: user?.sub ?? null,
    })
  })
  next()
}

export function logStructured(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {}
): void {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields })
  if (level === 'error') console.error(line)
  else if (level === 'warn') console.warn(line)
  else console.info(line)
}
