import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as adminService from '../../services/adminService'
import { renderWithProviders } from '../../test/render'
import { PayoutsPage } from '../PayoutsPage'

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
    listPayouts: vi.fn(),
    generatePayouts: vi.fn(),
    markPayoutPaid: vi.fn(),
  }
})

describe('PayoutsPage', () => {
  beforeEach(() => {
    vi.mocked(adminService.listPayouts).mockResolvedValue({
      items: [
        {
          id: 'payout_1',
          dealerId: 'dealer_1',
          dealerName: 'Prime Auto',
          amount: 180,
          status: 'pending',
          periodStart: '2026-07-01',
          periodEnd: '2026-07-31',
          paidAt: null,
          createdAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
    })
    vi.mocked(adminService.generatePayouts).mockResolvedValue({ created: 1 })
    vi.mocked(adminService.markPayoutPaid).mockResolvedValue({ ok: true })
  })

  it('ADM-UI-04: renders payout batches with dealer name', async () => {
    renderWithProviders(<PayoutsPage />)
    await waitFor(() => {
      expect(screen.getByText('Prime Auto')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Generate payouts/i })).toBeInTheDocument()
  })

  it('ADM-UI-05: generate payouts calls admin service', async () => {
    renderWithProviders(<PayoutsPage />)
    await waitFor(() => {
      expect(screen.getByText('Prime Auto')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Generate payouts/i }))
    await waitFor(() => {
      expect(adminService.generatePayouts).toHaveBeenCalledTimes(1)
    })
  })
})
