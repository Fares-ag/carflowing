import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { UNAUTHORIZED_EVENT } from '@carflow/shared'
import type { AuthSession } from '../services/authService'
import { getSession, logout as authLogout } from '../services/authService'
import { useCartStore } from '../stores/cartStore'

interface AuthContextValue {
  session: AuthSession | null
  isLoading: boolean
  refetch: () => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const refetch = useCallback(async () => {
    try {
      const nextSession = await getSession()
      setSession(nextSession)
    } catch {
      setSession(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const logout = useCallback(async () => {
    await authLogout()
    useCartStore.getState().clearCart()
    setSession(null)
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  // Global 401 handling (audit BUG-10): when any API call ultimately fails
  // with 401 after the silent refresh, drop the session. ProtectedRoute then
  // redirects to /login and the Header switches back to "Sign In". Public
  // pages (including /login) just re-render with a null session — no loop.
  useEffect(() => {
    const handleUnauthorized = () => setSession(null)
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized)
  }, [])

  return (
    <AuthContext.Provider value={{ session, isLoading, refetch, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
