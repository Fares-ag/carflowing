import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { PlansPage } from '../PlansPage'
import { renderWithProviders } from '../../test/render'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { userId: '1', role: 'admin', name: 'Admin', email: 'admin@carflow.dev' },
    isLoading: false,
    refetch: async () => undefined,
    logout: async () => undefined,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('PlansPage', () => {
  it('UI-A-PLAN-01: renders plans management UI', async () => {
    renderWithProviders(<PlansPage />)
    await waitFor(() => {
      expect(screen.getByText(/subscription plans management/i)).toBeInTheDocument()
    })
  })

  it('UI-A-PLAN-02: shows create plan action', async () => {
    renderWithProviders(<PlansPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create|add|new plan/i })).toBeInTheDocument()
    })
  })
})
