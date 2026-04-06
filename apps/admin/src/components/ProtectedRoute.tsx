import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface ProtectedRouteProps {
  allow: Array<'admin'>
}

export function ProtectedRoute({ allow }: ProtectedRouteProps) {
  const { session, isLoading } = useAuth()

  if (isLoading) {
    return <div className="route-loading">Loading...</div>
  }

  if (!session || !allow.includes(session.role)) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
