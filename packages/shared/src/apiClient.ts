export class ApiError extends Error {
  status: number
  details?: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.details = details
  }
}

export interface ApiRequestOptions {
  method?: string
  body?: unknown
  params?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
  signal?: AbortSignal
}

function buildQuery(params?: ApiRequestOptions['params']) {
  if (!params) return ''
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  return query ? `?${query}` : ''
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params, headers, signal } = options
  const response = await fetch(`${path}${buildQuery(params)}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  })

  if (!response.ok) {
    let errorPayload: unknown = null
    try {
      errorPayload = await response.json()
    } catch {
      errorPayload = await response.text()
    }
    throw new ApiError('Request failed', response.status, errorPayload)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
