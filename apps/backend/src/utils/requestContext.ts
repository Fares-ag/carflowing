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
