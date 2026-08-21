import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as adminService from '../../services/adminService'
import { renderWithProviders } from '../../test/render'
import { DashboardPage } from '../DashboardPage'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { userId: '1', role: 'admin', name: 'Admin', email: 'admin@carflow.dev' },
    isLoading: false,
    refetch: async () => undefined,
    logout: async () => undefined,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../services/authService', () => ({
  getCurrentUser: vi.fn().mockResolvedValue({ id: '1', name: 'Admin', email: 'a@test.dev', role: 'admin', createdAt: '2026-01-01' }),
}))

vi.mock('../../services/adminService', async () => {
  const actual = await vi.importActual<typeof adminService>('../../services/adminService')
  return { ...actual, getAdminDashboard: vi.fn() }
})

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(adminService.getAdminDashboard).mockResolvedValue({
      kpis: [{ label: 'Total Vehicles', value: 5 }],
      rentalsTrend: [],
      revenueTrend: [],
      recentRentals: [],
      bookingStatusCounts: { active: 0, reserved: 0, completed: 0, cancelled: 0 },
      todayBookingsCount: 0,
    })
  })

  it('ADM-UI-10: renders dashboard KPIs from API', async () => {
    renderWithProviders(<DashboardPage />)
    await waitFor(() => {
      expect(screen.getByText('Active Customers')).toBeInTheDocument()
    })
  })
})
