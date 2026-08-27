import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import { UNAUTHORIZED_EVENT } from '@carflow/shared'
import { toast } from 'sonner'
import type { AuthSession } from '../services/authService'
import { getSession, logout as authLogout } from '../services/authService'

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
    // The server call can fail (network down, cookie already revoked). Surface
    // it, but clear the local session either way — leaving the dealer looking
    // signed in against a server that may have dropped the session is worse
    // than a sign-out that reports a warning.
    try {
      await authLogout()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `Signed out on this device, but the server did not confirm: ${err.message}`
          : 'Signed out on this device, but the server did not confirm.'
      )
    } finally {
      setSession(null)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

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
