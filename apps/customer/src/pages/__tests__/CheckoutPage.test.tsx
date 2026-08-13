import { describe, expect, it, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { CheckoutPage } from '../CheckoutPage'
import { renderWithProviders } from '../../test/render'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { userId: '1', role: 'customer', name: 'Customer', email: 'customer@carflow.dev' },
    isLoading: false,
    refetch: async () => undefined,
    logout: async () => undefined,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../stores/cartStore', () => ({
  useCartStore: () => ({
    cart: {
      vehicleId: 'veh_1',
      vehicleName: 'Test Car',
      vehicleMake: 'Toyota',
      durationLabel: '3 months',
      durationMonths: 3,
      quantity: 1,
      startDate: '2026-08-10',
      notes: JSON.stringify({ paymentMethod: 'pay_at_shop' }),
      subtotal: 300,
      tax: 0,
      total: 300,
    },
    clearCart: vi.fn(),
  }),
}))

vi.mock('../../services/customerService', () => ({
  getCustomerProfile: vi.fn().mockResolvedValue({
    qid_document_path: null,
    drivers_license_path: null,
  }),
  createBookingRequest: vi.fn(),
  updateCustomerDocuments: vi.fn(),
}))

describe('CheckoutPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('UI-C-CHK-01: renders checkout sections from mock', () => {
    renderWithProviders(<CheckoutPage />)
    expect(screen.getByText('Personal Information')).toBeInTheDocument()
    expect(screen.getByText(/Driver's License Information/i)).toBeInTheDocument()
    expect(screen.getByText('Billing Address')).toBeInTheDocument()
    expect(screen.getByText('Emergency Contact')).toBeInTheDocument()
    expect(screen.getByText('Order Summary')).toBeInTheDocument()
    expect(screen.getByText('Need Help?')).toBeInTheDocument()
  })

  it('UI-C-CHK-02: shows personal info fields and continue CTA', () => {
    renderWithProviders(<CheckoutPage />)
    expect(screen.getByText(/First Name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continue/i })).toBeInTheDocument()
  })
})
