export function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10))
  const offset = (page - 1) * pageSize
  return { page, pageSize, offset, limit: pageSize }
}

/** Keyset/cursor pagination for large catalogs (Phase 3.4). */
export function parseCursorPagination(query: Record<string, unknown>) {
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20))
  const cursor = typeof query.cursor === 'string' && query.cursor.trim() ? query.cursor.trim() : undefined
  return { pageSize, cursor, limit: pageSize }
}

export function paginated<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize }
}

export function cursorPaginated<T>(items: T[], pageSize: number, nextCursor: string | null) {
  return { items, pageSize, nextCursor }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UUID_PARAM_NAMES = ['id', 'dealerId', 'customerId', 'userId', 'vehicleId', 'rentalId'] as const

/** Reject non-UUID route params so Postgres never 500s on invalid ids. */
export function attachUuidParamGuard(router: {
  param: (name: string, handler: (...args: any[]) => void) => void
}) {
  const handler = (
    _req: unknown,
    res: { status: (code: number) => { json: (body: unknown) => void } },
    next: () => void,
    value: string
  ) => {
    if (!UUID_RE.test(value)) {
      res.status(400).json({ error: 'Invalid id' })
      return
    }
    next()
  }
  for (const name of UUID_PARAM_NAMES) {
    router.param(name, handler)
  }
}

export function asyncHandler(
  fn: (req: any, res: any, next: any) => Promise<void>
) {
  return (req: any, res: any, next: any) => {
    fn(req, res, next).catch(next)
  }
}

/** Outbound HTTP with an AbortController timeout (default 10s). */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 10_000
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}
