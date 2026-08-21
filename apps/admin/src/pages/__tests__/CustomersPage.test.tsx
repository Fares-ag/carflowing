import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as adminService from '../../services/adminService'
import { renderWithProviders } from '../../test/render'
import { CustomersPage } from '../CustomersPage'

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
    listCustomersWithStats: vi.fn(),
    getCustomerStats: vi.fn(),
  }
})

describe('CustomersPage', () => {
  beforeEach(() => {
    vi.mocked(adminService.getCustomerStats).mockResolvedValue({
      total: 2,
      active: 2,
      suspended: 0,
      newThisMonth: 1,
    })
    vi.mocked(adminService.listCustomersWithStats).mockResolvedValue({
      items: [
        {
          id: 'c1',
          name: 'Chris Customer',
          email: 'customer@carflow.dev',
          role: 'customer',
          createdAt: '2026-01-01',
          rentalsCount: 1,
          totalSpent: 500,
          verification: 'verified',
          accountStatus: 'active',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    })
  })

  it('ADM-UI-02: renders customer stats from API', async () => {
    renderWithProviders(<CustomersPage />)
    await waitFor(() => {
      expect(screen.getByText('Chris Customer')).toBeInTheDocument()
    })
  })
})
