import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as adminService from '../../services/adminService'
import { renderWithProviders } from '../../test/render'
import { RentalPage } from '../RentalPage'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { userId: '1', role: 'admin', name: 'Admin', email: 'admin@carflow.dev' },
    isLoading: false,
    refetch: async () => undefined,
    logout: async () => undefined,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../services/adminService', async () => {
  const actual = await vi.importActual<typeof adminService>('../../services/adminService')
  return { ...actual, listRentalsWithDetails: vi.fn() }
})

describe('RentalPage', () => {
  beforeEach(() => {
    vi.mocked(adminService.listRentalsWithDetails).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
  })

  it('ADM-UI-13: renders rental management page', async () => {
    renderWithProviders(<RentalPage />)
    await waitFor(() => {
      expect(screen.getAllByText(/Rental/i).length).toBeGreaterThan(0)
    })
  })
})
