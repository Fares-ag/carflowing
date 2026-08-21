import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as adminService from '../../services/adminService'
import { renderWithProviders } from '../../test/render'
import { BookingRequestsPage } from '../BookingRequestsPage'

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
    listBookingRequests: vi.fn(),
    listVehicles: vi.fn(),
  }
})

describe('BookingRequestsPage', () => {
  beforeEach(() => {
    vi.mocked(adminService.listBookingRequests).mockResolvedValue({
      items: [{ id: 'br1', customerId: 'c1', vehicleId: 'v1', status: 'pending', createdAt: '2026-01-01' }],
      total: 1,
      page: 1,
      pageSize: 100,
    })
    vi.mocked(adminService.listVehicles).mockResolvedValue({
      items: [{ id: 'v1', name: 'BMW X5', dealerId: 'd1', make: 'BMW', model: 'X5', year: 2024, category: 'suv', status: 'available', pricePerDay: 450, mileage: 12000, transmission: 'automatic', fuelType: 'gas', seats: 5 }],
      total: 1,
      page: 1,
      pageSize: 100,
    })
  })

  it('ADM-UI-14: renders pending booking requests', async () => {
    renderWithProviders(<BookingRequestsPage />)
    await waitFor(() => {
      expect(screen.getAllByText(/Booking Requests/i).length).toBeGreaterThan(0)
    })
  })
})
