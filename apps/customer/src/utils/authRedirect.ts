export function getRedirectTarget(redirect: string | null): string {
  if (!redirect) return '/browse'
  const path = decodeURIComponent(redirect)
  if (path.startsWith('/') && !path.startsWith('//')) return path
  return '/browse'
}

export function withRedirectParam(basePath: string, redirect: string | null): string {
  if (!redirect) return basePath
  return `${basePath}?redirect=${encodeURIComponent(redirect)}`
}
