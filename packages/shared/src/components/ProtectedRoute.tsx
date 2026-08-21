import type { ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { UserRole } from '../types'

export interface ProtectedRouteAuthSession {
  role: UserRole
}

export interface ProtectedRouteAuthState {
  session: ProtectedRouteAuthSession | null
  isLoading: boolean
}

export interface ProtectedRouteProps {
  useAuth: () => ProtectedRouteAuthState
  allow: readonly UserRole[]
  /** When set, session.role must pass this check before allow-list matching (admin portal). */
  portalRoleCheck?: (role: string) => boolean
  forbiddenFallback?: ReactNode
  loginPath?: string
}

export function ProtectedRoute({
  useAuth,
  allow,
  portalRoleCheck,
  forbiddenFallback,
  loginPath = '/login',
}: ProtectedRouteProps) {
  const { session, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <div className="route-loading">Loading...</div>
  }

  if (!session || (portalRoleCheck && !portalRoleCheck(session.role))) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`${loginPath}?redirect=${redirect}`} replace state={{ from: location }} />
  }

  if (!allow.includes(session.role)) {
    return forbiddenFallback ?? <div className="route-forbidden">You don&apos;t have access</div>
  }

  return <Outlet />
}
