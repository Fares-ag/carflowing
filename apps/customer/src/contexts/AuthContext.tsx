import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import type { AuthSession } from '../services/authService'
import { getSession, logout as authLogout } from '../services/authService'
import { useCartStore } from '../stores/cartStore'
import { supabase } from '@carflow/shared'

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

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      refetch()
      if (event === 'SIGNED_OUT') {
        useCartStore.getState().clearCart()
      }
    })
    return () => subscription.unsubscribe()
  }, [refetch])

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
