import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface ProtectedRouteProps {
  allow: Array<'dealer'>
}

export function ProtectedRoute({ allow }: ProtectedRouteProps) {
  const { session, isLoading } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return <div className="route-loading">Loading...</div>
  }

  if (!session || !allow.includes(session.role)) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace state={{ from: location }} />
  }

  return <Outlet />
}
