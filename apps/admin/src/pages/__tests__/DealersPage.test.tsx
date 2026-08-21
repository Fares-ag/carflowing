import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as adminService from '../../services/adminService'
import { renderWithProviders } from '../../test/render'
import { DealersPage } from '../DealersPage'

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
  return { ...actual, listDealers: vi.fn(), updateDealerBankDetails: vi.fn() }
})

describe('DealersPage', () => {
  beforeEach(() => {
    vi.mocked(adminService.listDealers).mockResolvedValue({
      items: [
        {
          id: 'd1',
          name: 'Prime Auto',
          status: 'active',
          ownerUserId: 'u1',
          planId: 'p1',
          rating: 4.5,
          totalRevenue: 12000,
          activeRentals: 2,
          vehiclesCount: 5,
          contactEmail: 'd@test.dev',
          bankAccountName: 'Prime Auto LLC',
          bankName: 'QNB',
          bankIban: 'QA58QNBA000000000000000000001',
          createdAt: '2026-01-01',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    })
    vi.mocked(adminService.updateDealerBankDetails).mockResolvedValue({
      id: 'd1',
      name: 'Prime Auto',
      status: 'active',
      ownerUserId: 'u1',
      planId: 'p1',
      rating: 4.5,
      totalRevenue: 12000,
      activeRentals: 2,
      vehiclesCount: 5,
      contactEmail: 'd@test.dev',
      bankAccountName: 'Prime Auto LLC',
      bankName: 'QNB',
      bankIban: 'QA58QNBA000000000000000000001',
      bankDetailsVerifiedAt: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-01-01',
    })
  })

  it('ADM-UI-03: renders dealers list with add button', async () => {
    renderWithProviders(<DealersPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Dealer/i })).toBeInTheDocument()
    })
  })

  it('ADM-UI-06: dealer detail modal shows bank details and verify action', async () => {
    renderWithProviders(<DealersPage />)
    await waitFor(() => {
      expect(screen.getByText('Prime Auto')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTitle('View details'))
    expect(screen.getByText('Payout bank details')).toBeInTheDocument()
    expect(screen.getByText(/QA58QNBA/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Verify bank details/i }))
    await waitFor(() => {
      expect(adminService.updateDealerBankDetails).toHaveBeenCalledWith('d1', { verified: true })
    })
  })
})
