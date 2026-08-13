import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/** Scrolls the window to the top on every pathname change. */
export function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}
