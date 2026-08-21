import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as adminService from '../../services/adminService'
import { renderWithProviders } from '../../test/render'
import { CarsPage } from '../CarsPage'

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
  return {
    ...actual,
    listVehicles: vi.fn(),
    listDealers: vi.fn(),
    listRentalsWithDetails: vi.fn(),
  }
})

describe('CarsPage', () => {
  beforeEach(() => {
    vi.mocked(adminService.listVehicles).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
    vi.mocked(adminService.listDealers).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
    vi.mocked(adminService.listRentalsWithDetails).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
  })

  it('ADM-UI-12: renders cars management page', async () => {
    renderWithProviders(<CarsPage />)
    await waitFor(() => {
      expect(screen.getByText(/Add Car for Dealer/i)).toBeInTheDocument()
    })
  })
})
