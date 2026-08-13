import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import { ProtectedRoute } from '../ProtectedRoute'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../../contexts/AuthContext'

describe('ProtectedRoute', () => {
  it('UI-C-PROT-01: shows loading state', () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      isLoading: true,
      refetch: async () => undefined,
      logout: async () => undefined,
    })
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<ProtectedRoute allow={['customer']} />}>
            <Route path="/dashboard" element={<div>Secret</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('UI-C-PROT-03: allows customer role through to outlet', () => {
    vi.mocked(useAuth).mockReturnValue({
      session: { userId: '1', role: 'customer', name: 'C', email: 'c@test.dev' },
      isLoading: false,
      refetch: async () => undefined,
      logout: async () => undefined,
    })
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<ProtectedRoute allow={['customer']} />}>
            <Route path="/dashboard" element={<div>Secret</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Secret')).toBeInTheDocument()
  })

  it('UI-C-PROT-02: blocks wrong role by redirecting away from protected content', () => {
    vi.mocked(useAuth).mockReturnValue({
      session: { userId: '1', role: 'dealer', name: 'D', email: 'd@test.dev' },
      isLoading: false,
      refetch: async () => undefined,
      logout: async () => undefined,
    })
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<ProtectedRoute allow={['customer']} />}>
            <Route path="/dashboard" element={<div>Secret</div>} />
          </Route>
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.queryByText('Secret')).not.toBeInTheDocument()
    expect(screen.getByText('Login Page')).toBeInTheDocument()
  })
})
