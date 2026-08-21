import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { BookingRequests } from '../BookingRequests'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { userId: '1', role: 'dealer', name: 'Dealer', email: 'dealer@carflow.dev' },
    isLoading: false,
    refetch: async () => undefined,
    logout: async () => undefined,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('BookingRequests page', () => {
  it('UI-D-REQ-01: renders booking requests heading', async () => {
    renderWithProviders(<BookingRequests />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /booking requests/i })).toBeInTheDocument()
    })
  })

  it('UI-D-REQ-02: shows search input', async () => {
    renderWithProviders(<BookingRequests />)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument()
    })
  })
})
