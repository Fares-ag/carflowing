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
  // Read the body exactly once. Calling response.json() and then falling back to
  // response.text() throws "body stream already read", which escapes as a raw
  // TypeError — no ApiError, so callers never see the real status (notably 401,
  // which drives the session-expiry redirect). Non-JSON error bodies are normal
  // in production: rate-limit 429s, proxy 502/504 pages, and framework 404s.
  let errorPayload: unknown = null
  const raw = await response.text().catch(() => '')
  if (raw) {
    try {
      errorPayload = JSON.parse(raw)
    } catch {
      errorPayload = raw
    }
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

  // /auth/* endpoints answer 401 as a real verdict (bad credentials, dead
  // refresh cookie) and must not recurse through the refresh path. /auth/me is
  // the exception: it is the session-restore probe, so a 401 there just means
  // the 15-minute access token aged out while the refresh cookie is still good.
  const skipRefresh = path.startsWith('/auth/') && !path.startsWith('/auth/me')
  if (response.status === 401 && !skipRefresh) {
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
