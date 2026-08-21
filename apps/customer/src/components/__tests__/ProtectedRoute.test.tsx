import type { AuthSession } from '../../services/authService'
import { ProtectedRoute } from '@carflow/shared'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../../contexts/AuthContext'

describe('ProtectedRoute', () => {
  it('CUS-UI-01: blocks unauthenticated users from protected routes', () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      isLoading: false,
      refetch: async () => undefined,
      logout: async () => undefined,
    })
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route element={<ProtectedRoute useAuth={useAuth} allow={['customer']} />}>
            <Route path="/settings" element={<div>Account settings</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    expect(screen.queryByText('Account settings')).not.toBeInTheDocument()
  })

  it('CUS-UI-01b: allows authenticated customers through', () => {
    vi.mocked(useAuth).mockReturnValue({
      session: { userId: '1', role: 'customer', name: 'Customer', email: 'c@test.dev' },
      isLoading: false,
      refetch: async () => undefined,
      logout: async () => undefined,
    })
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route element={<ProtectedRoute useAuth={useAuth} allow={['customer']} />}>
            <Route path="/settings" element={<div>Account settings</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Account settings')).toBeInTheDocument()
  })

  it('CUS-UI-02: blocks non-customer roles', () => {
    vi.mocked(useAuth).mockReturnValue({
      session: { userId: '2', role: 'dealer', name: 'Dealer', email: 'd@test.dev' } as unknown as AuthSession,
      isLoading: false,
      refetch: async () => undefined,
      logout: async () => undefined,
    })
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route element={<ProtectedRoute useAuth={useAuth} allow={['customer']} />}>
            <Route path="/settings" element={<div>Account settings</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    expect(screen.queryByText('Account settings')).not.toBeInTheDocument()
  })
})
