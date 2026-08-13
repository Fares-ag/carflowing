const DEFAULT_AFTER_LOGIN = '/dashboard'

/** Only allow same-origin relative paths (no protocol-relative or absolute URLs). */
export function getRedirectTarget(redirect: string | null): string {
  if (!redirect) return DEFAULT_AFTER_LOGIN
  const path = decodeURIComponent(redirect)
  if (path.startsWith('/') && !path.startsWith('//')) return path
  return DEFAULT_AFTER_LOGIN
}

export function withRedirectParam(basePath: string, redirect: string | null): string {
  if (!redirect) return basePath
  return `${basePath}?redirect=${encodeURIComponent(redirect)}`
}
