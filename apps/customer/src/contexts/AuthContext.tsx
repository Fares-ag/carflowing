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
import { queryClient } from '../lib/queryClient'

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
    let logoutError: unknown = null
    try {
      await authLogout()
    } catch (err) {
      // The server-side session may still be alive. Clearing local state anyway
      // is the safer half: this device stops showing the account, and the
      // caller surfaces the failure so the customer can sign out again from a
      // trusted device.
      logoutError = err
    }
    useCartStore.getState().clearCart()
    // Without this the next account to sign in on this tab renders the previous
    // user's cached bookings, invoices and messages until each query refetches.
    queryClient.clear()
    setSession(null)
    if (logoutError) throw logoutError
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
