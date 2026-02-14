import type { Paginated } from '@carflow/shared'
import { USE_MOCK_API } from './serviceMode'

const DEFAULT_LATENCY_MS = 250

export async function withLatency<T>(data: T, latencyMs: number = DEFAULT_LATENCY_MS): Promise<T> {
  if (!USE_MOCK_API) {
    throw new Error('API mode is not configured yet. Enable mock mode or add API clients.')
  }
  await new Promise(resolve => setTimeout(resolve, latencyMs))
  return data
}

export function paginate<T>(items: T[], page: number = 1, pageSize: number = 10): Paginated<T> {
  const start = (page - 1) * pageSize
  const pagedItems = items.slice(start, start + pageSize)

  return {
    items: pagedItems,
    total: items.length,
    page,
    pageSize,
  }
}
