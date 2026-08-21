import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { LoginPage } from '../LoginPage'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: null,
    isLoading: false,
    refetch: async () => undefined,
    logout: async () => undefined,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('LoginPage', () => {
  it('ADM-UI-09: renders admin login form', () => {
    renderWithProviders(<LoginPage />)
    expect(screen.getByText('Admin Login')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Sign in/i })).toBeInTheDocument()
  })
})
