import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as authService from '../../services/authService'
import { AuthProvider, useAuth } from '../AuthContext'

vi.mock('../../services/authService', () => ({
  getSession: vi.fn(),
  logout: vi.fn(),
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
})
