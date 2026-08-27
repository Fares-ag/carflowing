import type { Invoice, Rental } from '@carflow/shared'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SubscriptionPanel } from '../SubscriptionPanel'
import {
  getRentalSubscription,
  type RentalSubscriptionData,
} from '../../../services/customerService'
import { getSkipCashPaymentStatus } from '../../../services/paymentService'
import { INVOICE_PAYMENT_SESSION_KEY } from '../../../utils/paymentRetry'

vi.mock('../../../services/customerService', () => ({
  getRentalSubscription: vi.fn(),
  getBillingCapabilities: vi.fn().mockResolvedValue({
    skipcashSavedCardsEnabled: false,
    skipcashSavedCardsChargeReady: false,
    capabilityRequired: 'skipcash',
  }),
  listPaymentMethods: vi.fn().mockResolvedValue([]),
  listCatalogVehicles: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }),
  listRentalMaintenanceRequests: vi.fn().mockResolvedValue([]),
  getRentalReview: vi.fn().mockResolvedValue(null),
  cancelRental: vi.fn(),
  cancelSwapRequest: vi.fn(),
  createSwapRequest: vi.fn(),
  createRentalMaintenanceRequest: vi.fn(),
  extendRental: vi.fn(),
  pauseRental: vi.fn(),
  resumeRental: vi.fn(),
  submitRentalReview: vi.fn(),
}))

vi.mock('../../../services/paymentService', () => ({
  getSkipCashPaymentStatus: vi.fn(),
  createSkipCashInvoiceIntent: vi.fn(),
  createSkipCashInvoiceIntentWithSavedCard: vi.fn(),
  retrySkipCashPayment: vi.fn(),
}))

vi.mock('../../../services/authService', () => ({
  resendVerificationEmail: vi.fn(),
}))

const INVOICE: Invoice = {
  id: 'inv_1',
  ownerId: 'cus_1',
  ownerType: 'customer',
  amount: 3000,
  status: 'due',
  date: '2026-08-01',
  description: 'Monthly subscription',
  rentalId: 'ren_1',
}

const RENTAL: Rental = {
  id: 'ren_1',
  customerId: 'cus_1',
  dealerId: 'dea_1',
  vehicleId: 'veh_1',
  startDate: '2026-07-01',
  endDate: '2026-10-01',
  status: 'active',
  totalAmount: 9000,
  paymentStatus: 'pending',
  createdAt: '2026-07-01T00:00:00.000Z',
  monthlyAmount: 3000,
  termMonths: 3,
}

const SUBSCRIPTION: RentalSubscriptionData = {
  rental: RENTAL,
  vehicle: null,
  invoices: [INVOICE],
  events: [],
  swapRequests: [],
  swapEligibleFrom: null,
  maxPauseDays: 90,
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SubscriptionPanel invoice retry safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    vi.mocked(getRentalSubscription).mockResolvedValue(SUBSCRIPTION)
    sessionStorage.setItem(
      INVOICE_PAYMENT_SESSION_KEY,
      JSON.stringify({ invoiceId: 'inv_1', paymentId: 'pay_1' })
    )
  })

  it('UI-C-SUB-01: hides retry while the SkipCash payment is still pending', async () => {
    vi.mocked(getSkipCashPaymentStatus).mockResolvedValue({
      id: 'pay_1',
      amount: 3000,
      status: 'pending',
      type: 'subscription',
      method: 'card',
      createdAt: '2026-08-01T00:00:00.000Z',
    })

    render(<SubscriptionPanel rentalId="ren_1" />, { wrapper: Providers })

    await waitFor(() => {
      expect(screen.getByText(/still confirming your payment/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /Retry payment/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Pay online/i })).not.toBeInTheDocument()
  })

  it('UI-C-SUB-02: offers retry once the payment is confirmed failed', async () => {
    vi.mocked(getSkipCashPaymentStatus).mockResolvedValue({
      id: 'pay_1',
      amount: 3000,
      status: 'failed',
      type: 'subscription',
      method: 'card',
      createdAt: '2026-08-01T00:00:00.000Z',
    })

    render(<SubscriptionPanel rentalId="ren_1" />, { wrapper: Providers })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Retry payment/i })).toBeInTheDocument()
    })
    expect(screen.queryByText(/still confirming your payment/i)).not.toBeInTheDocument()
  })
})
