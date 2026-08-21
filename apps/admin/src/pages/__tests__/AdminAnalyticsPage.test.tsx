import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as adminService from '../../services/adminService'
import { renderWithProviders } from '../../test/render'
import { AdminAnalyticsPage } from '../AdminAnalyticsPage'

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
  return { ...actual, getAdminAnalytics: vi.fn(), getAnalyticsRollups: vi.fn() }
})

describe('AdminAnalyticsPage', () => {
  beforeEach(() => {
    vi.mocked(adminService.getAdminAnalytics).mockResolvedValue({
      kpis: [{ label: 'Total Revenue', value: 1000 }],
      revenueTrend: [],
      rentalsTrend: [],
      categoryDistribution: [],
      topVehicles: [],
    })
    vi.mocked(adminService.getAnalyticsRollups).mockResolvedValue({
      revenue: [],
      rentals: [],
      metrics: {
        activationRate: 80,
        approvalSlaHours: 3.5,
        paymentSuccessRate: 95,
        churnRate: 5,
        counts: {
          signups: 10,
          emailVerified: 8,
          bookingsApproved: 4,
          paymentsCompleted: 19,
          paymentsFailed: 1,
          rentalsActivated: 3,
          cancelRequested: 1,
        },
      },
      metricTrends: {
        activation_rate: [],
        approval_sla_hours: [],
        payment_success_rate: [],
        churn_rate: [],
      },
    })
  })

  it('ADM-UI-16: renders analytics KPIs and lifecycle metrics', async () => {
    renderWithProviders(<AdminAnalyticsPage />)
    await waitFor(() => {
      expect(screen.getByText('Total Revenue')).toBeInTheDocument()
      expect(screen.getByText('Activation rate')).toBeInTheDocument()
      expect(screen.getByText('Payment success')).toBeInTheDocument()
    })
  })
})
