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
    searchVehicles: vi.fn(),
    listDealers: vi.fn(),
    listRentalsWithDetails: vi.fn(),
  }
})

describe('CarsPage', () => {
  beforeEach(() => {
    vi.mocked(adminService.listVehicles).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
    vi.mocked(adminService.searchVehicles).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
    vi.mocked(adminService.listDealers).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
    vi.mocked(adminService.listRentalsWithDetails).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
  })

  it('ADM-UI-12: renders cars management page', async () => {
    renderWithProviders(<CarsPage />)
    await waitFor(() => {
      expect(screen.getByText(/Add Car for Dealer/i)).toBeInTheDocument()
    })
  })

  it('ADM-UI-12b: ships no dead "More" toolbar affordance', async () => {
    renderWithProviders(<CarsPage />)
    await waitFor(() => {
      expect(screen.getByText(/Add Car for Dealer/i)).toBeInTheDocument()
    })
    // The button's only behaviour was a "coming soon" modal.
    expect(screen.queryByRole('button', { name: /^more$/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument()
  })

  it('ADM-UI-12c: falls back to a real identifier rather than "Unknown customer"', async () => {
    vi.mocked(adminService.listRentalsWithDetails).mockResolvedValue({
      items: [
        {
          id: 'rental_1',
          vehicleId: 'veh_1',
          customerId: 'cust_1',
          dealerId: 'dealer_1',
          status: 'reserved',
          startDate: '2026-08-01',
          endDate: '2026-09-01',
          monthlyPrice: 2000,
          totalAmount: 2000,
          createdAt: '2026-08-01T00:00:00.000Z',
          customer: { id: 'cust_1', email: 'nameless@carflow.qa' },
        },
      ] as unknown as Awaited<ReturnType<typeof adminService.listRentalsWithDetails>>['items'],
      total: 1,
      page: 1,
      pageSize: 50,
    })
    renderWithProviders(<CarsPage />)
    await waitFor(() => expect(screen.getAllByText('nameless@carflow.qa').length).toBeGreaterThan(0))
    expect(screen.queryByText(/Unknown customer/i)).not.toBeInTheDocument()
  })
})
