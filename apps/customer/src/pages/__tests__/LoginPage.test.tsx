import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { LoginPage } from '../LoginPage'
import { renderWithProviders } from '../../test/render'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: null,
    isLoading: false,
    refetch: async () => undefined,
    logout: async () => undefined,
    login: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('LoginPage UI scenarios', () => {
  it('UI-C-LOGIN-01: renders sign in form', () => {
    renderWithProviders(<LoginPage />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('UI-C-LOGIN-02: email field is prefilled for demo login', () => {
    renderWithProviders(<LoginPage />)
    expect(screen.getByLabelText(/email/i)).toHaveValue('customer@carflow.dev')
  })
})
