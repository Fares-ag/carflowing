export function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10))
  const offset = (page - 1) * pageSize
  return { page, pageSize, offset, limit: pageSize }
}

export function paginated<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize }
}

export function asyncHandler(
  fn: (req: any, res: any, next: any) => Promise<void>
) {
  return (req: any, res: any, next: any) => {
    fn(req, res, next).catch(next)
  }
}
