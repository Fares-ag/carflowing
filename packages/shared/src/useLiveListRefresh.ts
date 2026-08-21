import { useEffect, useRef } from 'react'

/**
 * Refetch list data when the tab regains focus and on a short poll interval
 * while `active` is true (Phase 1.1 cross-portal freshness).
 */
export function useLiveListRefresh(
  refetch: () => void,
  options: { active?: boolean; pollMs?: number } = {}
): void {
  const { active = true, pollMs = 15_000 } = options
  const refetchRef = useRef(refetch)
  refetchRef.current = refetch

  useEffect(() => {
    if (!active) return
    const run = () => refetchRef.current()
    const onFocus = () => run()
    const onVisibility = () => {
      if (document.visibilityState === 'visible') run()
    }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    const id = window.setInterval(run, pollMs)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
      window.clearInterval(id)
    }
  }, [active, pollMs])
}
