import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface ProtectedRouteProps {
  allow: Array<'customer'>
}

export function ProtectedRoute({ allow }: ProtectedRouteProps) {
  const location = useLocation()
  const { session, isLoading } = useAuth()

  if (isLoading) {
    return <div className="route-loading">Loading...</div>
  }

  if (!session || !allow.includes(session.role)) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace state={{ from: location }} />
  }

  return <Outlet />
}
