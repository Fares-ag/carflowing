import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import * as authService from '../../services/authService'
import { AuthProvider, useAuth } from '../AuthContext'

vi.mock('../../services/authService', () => ({
  getSession: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}))

describe('AuthContext', () => {
  beforeEach(() => {
    vi.mocked(authService.getSession).mockResolvedValue({
      userId: '1',
      role: 'admin',
      name: 'Admin',
      email: 'admin@carflow.dev',
    })
  })

  it('ADM-UI-08: loads session on mount', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.session?.email).toBe('admin@carflow.dev')
  })

  it('ADM-UI-08b: logout clears the session on success', async () => {
    vi.mocked(authService.logout).mockResolvedValue(undefined)
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.session).toBeNull()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('ADM-UI-08c: a failing logout surfaces the error and still clears local state', async () => {
    vi.mocked(authService.logout).mockRejectedValue(new Error('Network unreachable'))
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.session).not.toBeNull()

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.session).toBeNull()
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Network unreachable'))
  })
})
