import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentStatusPage } from '../PaymentStatusPage'
import {
  getSkipCashPaymentStatus,
  type SkipCashPaymentStatus,
} from '../../services/paymentService'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { userId: '1', role: 'customer', name: 'Customer', email: 'customer@carflow.dev' },
    isLoading: false,
    refetch: async () => undefined,
    logout: async () => undefined,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../services/paymentService', () => ({
  getSkipCashPaymentStatus: vi.fn(),
  retrySkipCashPayment: vi.fn(),
}))

vi.mock('../../services/customerService', () => ({
  getUnreadNotificationCount: vi.fn().mockResolvedValue(0),
  getUnreadMessageCount: vi.fn().mockResolvedValue(0),
  listInvoices: vi.fn().mockResolvedValue([]),
  getVehicle: vi.fn(),
}))

const basePayment: SkipCashPaymentStatus = {
  id: 'pay_1',
  amount: 3000,
  status: 'pending',
  type: 'subscription',
  method: 'card',
  createdAt: '2026-08-01T00:00:00.000Z',
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/payment-status?paymentId=pay_1']}>
      <PaymentStatusPage />
    </MemoryRouter>
  )
}

describe('PaymentStatusPage retry safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('UI-C-PAY-01: keeps waiting on a pending payment and never offers retry', async () => {
    vi.mocked(getSkipCashPaymentStatus).mockResolvedValue(basePayment)
    renderPage()

    await waitFor(() => {
      expect(screen.getByText(/Confirming your payment/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /Try again/i })).not.toBeInTheDocument()
  })

  it('UI-C-PAY-02: polls well past a 3DS round-trip before giving up, then shows a wait message instead of retry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(getSkipCashPaymentStatus).mockResolvedValue(basePayment)
    renderPage()

    // Four minutes in — comfortably past the old 30-second budget — we are
    // still polling rather than inviting a second charge.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60 * 1000)
    })
    expect(screen.getByText(/Confirming your payment/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try again/i })).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000)
    })
    expect(screen.getByText(/We are still confirming your payment/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try again/i })).not.toBeInTheDocument()
  })

  it('UI-C-PAY-03: offers retry only once the payment is confirmed failed', async () => {
    vi.mocked(getSkipCashPaymentStatus).mockResolvedValue({ ...basePayment, status: 'failed' })
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Payment failed')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument()
  })
})
