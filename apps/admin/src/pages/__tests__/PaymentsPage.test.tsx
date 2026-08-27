import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as adminService from '../../services/adminService'
import { renderWithProviders } from '../../test/render'
import { PaymentsPage } from '../PaymentsPage'

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
    listPaymentsWithDetails: vi.fn(),
    getPaymentSummary: vi.fn(),
    refundPayment: vi.fn(),
  }
})

describe('PaymentsPage contract', () => {
  beforeEach(() => {
    vi.mocked(adminService.getPaymentSummary).mockResolvedValue({
      totalRevenue: 1000,
      grossRevenue: 1000,
      pendingCount: 0,
      completedCount: 1,
      refundedCount: 0,
      refundTotal: 0,
      needsRefundCount: 0,
      stuckPendingCount: 0,
      overdueInvoicesCount: 0,
    })
    vi.mocked(adminService.listPaymentsWithDetails).mockResolvedValue({
      items: [
        {
          id: 'pay_1',
          customerId: 'cust_1',
          amount: 500,
          status: 'completed',
          type: 'rental',
          method: 'card',
          createdAt: '2026-01-01T00:00:00.000Z',
          customer: {
            id: 'cust_1',
            name: 'Chris Customer',
            email: 'customer@carflow.dev',
            role: 'customer',
            createdAt: '2025-01-01',
          },
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    })
  })

  it('A-QA-003: displays customer name from nested payment.customer', async () => {
    renderWithProviders(<PaymentsPage />)
    await waitFor(() => {
      expect(screen.getByText('Chris Customer')).toBeInTheDocument()
    })
  })

  it('A-QA-004: shows the real payment id, not a synthetic uppercased prefix', async () => {
    renderWithProviders(<PaymentsPage />)
    await waitFor(() => expect(screen.getByText('pay_1')).toBeInTheDocument())
    // The old row showed `id.slice(0, 8).toUpperCase()`, a reference that
    // matches nothing in the database or at the gateway.
    expect(screen.queryByText('PAY_1')).not.toBeInTheDocument()
  })

  it('A-QA-005: prefers the gateway transaction id when the provider issued one', async () => {
    vi.mocked(adminService.listPaymentsWithDetails).mockResolvedValue({
      items: [
        {
          id: 'pay_2',
          customerId: 'cust_1',
          amount: 500,
          status: 'completed',
          type: 'rental',
          method: 'card',
          provider: 'skipcash',
          externalTransactionId: 'SKC-9f2c41',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    })
    renderWithProviders(<PaymentsPage />)
    await waitFor(() => expect(screen.getByText('SKC-9f2c41')).toBeInTheDocument())
    expect(screen.getByText('SKC-9f2c41')).toHaveAttribute(
      'title',
      'Gateway reference: SKC-9f2c41'
    )
  })
})
