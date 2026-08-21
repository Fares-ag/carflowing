/** Only allow same-origin relative paths (no protocol-relative or absolute URLs). */
export function getRedirectTarget(redirect: string | null, defaultPath = '/dashboard'): string {
  if (!redirect) return defaultPath
  const path = decodeURIComponent(redirect)
  if (path.startsWith('/') && !path.startsWith('//')) return path
  return defaultPath
}

export function withRedirectParam(basePath: string, redirect: string | null): string {
  if (!redirect) return basePath
  return `${basePath}?redirect=${encodeURIComponent(redirect)}`
}
