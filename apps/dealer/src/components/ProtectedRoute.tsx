import { Navigate, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import type { AuthSession } from '../services/authService'
import { getSession } from '../services/authService'

interface ProtectedRouteProps {
  allow: Array<'dealer'>
}

export function ProtectedRoute({ allow }: ProtectedRouteProps) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let active = true
    getSession()
      .then((nextSession) => {
        if (!active) return
        setSession(nextSession)
        setIsLoading(false)
      })
      .catch(() => {
        if (!active) return
        setSession(null)
        setIsLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (isLoading) {
    return <div className="route-loading">Loading...</div>
  }

  if (!session || !allow.includes(session.role)) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
