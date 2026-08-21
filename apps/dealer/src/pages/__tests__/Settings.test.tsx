import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { Settings } from '../Settings'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { userId: '1', role: 'dealer', name: 'Dealer', email: 'dealer@carflow.dev' },
    isLoading: false,
    refetch: async () => undefined,
    logout: async () => undefined,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../components/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar-stub" />,
}))

vi.mock('../../components/Header', () => ({
  Header: () => <div data-testid="header-stub" />,
}))

describe('Dealer Settings bank details', () => {
  it('UI-D-SET-01: business tab shows payout bank details section', async () => {
    renderWithProviders(<Settings />)
    await waitFor(() => {
      expect(screen.getByText('Payout bank details')).toBeInTheDocument()
    })
    expect(screen.getByPlaceholderText(/Legal business name on account/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/QA00/i)).toBeInTheDocument()
  })
})
