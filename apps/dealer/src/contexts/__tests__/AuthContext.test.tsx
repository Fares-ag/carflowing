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

describe('Dealer AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authService.getSession).mockResolvedValue({
      userId: '1',
      role: 'dealer',
      name: 'Dealer',
      email: 'dealer@carflow.dev',
    })
  })

  it('UI-D-AUTH-01: loads the session on mount', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.session?.email).toBe('dealer@carflow.dev')
  })

  it('UI-D-AUTH-02: logout clears the session on success without an error toast', async () => {
    vi.mocked(authService.logout).mockResolvedValue(undefined)
    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.logout()
    })

    expect(result.current.session).toBeNull()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('UI-D-AUTH-03: a failing logout surfaces the error and still clears local state', async () => {
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
