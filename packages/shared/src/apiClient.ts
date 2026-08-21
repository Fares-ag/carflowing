import { UNAUTHORIZED_EVENT } from './constants/events.js'

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

/** True when the API returned 503 — typically a feature kill switch is active. */
export function isTemporarilyUnavailable(err: unknown): boolean {
  return err instanceof ApiError && err.status === 503
}

export interface ApiRequestOptions {
  method?: string
  body?: unknown
  params?: Record<string, string | number | boolean | undefined>
  headers?: Record<string, string>
  signal?: AbortSignal
}

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) || '/api'

function buildQuery(params?: ApiRequestOptions['params']) {
  if (!params) return ''
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
  return query ? `?${query}` : ''
}

let refreshPromise: Promise<boolean> | null = null

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((r) => r.ok)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

function dispatchUnauthorized(path: string) {
  if (
    typeof window !== 'undefined' &&
    !path.startsWith('/auth/') &&
    typeof CustomEvent !== 'undefined'
  ) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
  }
}

async function parseErrorResponse(response: Response): Promise<never> {
  let errorPayload: unknown = null
  try {
    errorPayload = await response.json()
  } catch {
    errorPayload = await response.text()
  }
  const message =
    typeof errorPayload === 'object' &&
    errorPayload &&
    'error' in errorPayload &&
    typeof (errorPayload as { error: unknown }).error === 'string'
      ? (errorPayload as { error: string }).error
      : 'Request failed'
  throw new ApiError(message, response.status, errorPayload)
}

async function authorizedFetch(path: string, options: ApiRequestOptions = {}): Promise<Response> {
  const { method = 'GET', body, params, headers, signal } = options
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData

  const doFetch = () =>
    fetch(`${API_BASE}${path}${buildQuery(params)}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? (isForm ? (body as FormData) : JSON.stringify(body)) : undefined,
      signal,
    })

  let response = await doFetch()

  if (response.status === 401 && !path.startsWith('/auth/')) {
    const refreshed = await tryRefresh()
    if (refreshed) {
      response = await doFetch()
    }
  }

  if (!response.ok) {
    await parseErrorResponse(response)
  }

  return response
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  try {
    const response = await authorizedFetch(path, options)
    if (response.status === 204) {
      return undefined as T
    }
    return response.json() as Promise<T>
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      dispatchUnauthorized(path)
    }
    throw error
  }
}

/** Fetch a binary response (e.g. PDF) with the same auth/refresh behaviour as apiRequest. */
export async function apiFetchBlob(path: string, options: ApiRequestOptions = {}): Promise<Blob> {
  try {
    const response = await authorizedFetch(path, options)
    return response.blob()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      dispatchUnauthorized(path)
    }
    throw error
  }
}
