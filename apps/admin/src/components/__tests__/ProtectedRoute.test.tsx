import { ProtectedRoute, isAdminPortalRole } from '@carflow/shared'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { ForbiddenPage } from '../../pages/ForbiddenPage'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}))

import { useAuth } from '../../contexts/AuthContext'

function AdminRoute({ allow }: { allow: readonly ('admin' | 'finance' | 'ops' | 'support')[] }) {
  return (
    <ProtectedRoute
      useAuth={useAuth}
      allow={allow}
      portalRoleCheck={isAdminPortalRole}
      forbiddenFallback={<ForbiddenPage />}
    />
  )
}

describe('ProtectedRoute', () => {
  it('ADM-UI-01: blocks unauthenticated users from protected routes', () => {
    vi.mocked(useAuth).mockReturnValue({
      session: null,
      isLoading: false,
      refetch: async () => undefined,
      logout: async () => undefined,
    })
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<AdminRoute allow={['admin', 'finance', 'ops', 'support']} />}>
            <Route path="/dashboard" element={<div>Secret dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    expect(screen.queryByText('Secret dashboard')).not.toBeInTheDocument()
  })

  it('ADM-UI-01b: allows admin portal roles through', () => {
    vi.mocked(useAuth).mockReturnValue({
      session: { userId: '1', role: 'finance', name: 'Finance', email: 'finance@test.dev' },
      isLoading: false,
      refetch: async () => undefined,
      logout: async () => undefined,
    })
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route element={<AdminRoute allow={['admin', 'finance', 'ops', 'support']} />}>
            <Route path="/dashboard" element={<div>Secret dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText('Secret dashboard')).toBeInTheDocument()
  })

  it('ADM-UI-02: shows forbidden screen when role lacks route access', () => {
    vi.mocked(useAuth).mockReturnValue({
      session: { userId: '2', role: 'ops', name: 'Ops', email: 'ops@test.dev' },
      isLoading: false,
      refetch: async () => undefined,
      logout: async () => undefined,
    })
    render(
      <MemoryRouter initialEntries={['/plans']}>
        <Routes>
          <Route element={<AdminRoute allow={['admin']} />}>
            <Route path="/plans" element={<div>Plans admin only</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    )
    expect(screen.queryByText('Plans admin only')).not.toBeInTheDocument()
    expect(screen.getByText("You don't have access")).toBeInTheDocument()
  })
})
