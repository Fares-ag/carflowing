import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as customerService from '../../services/customerService'
import { renderWithProviders } from '../../test/render'
import { CheckoutPage } from '../CheckoutPage'
import { recordConsentsSafely } from '../../services/consentService'
import { createBookingRequest } from '../../services/customerService'
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
      total: 300,
    },
    clearCart: vi.fn(),
  }),
}))

vi.mock('../../services/consentService', () => ({
  recordConsents: vi.fn(),
  recordConsentsSafely: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../../services/customerService', async () => {
  const actual = await vi.importActual<typeof customerService>('../../services/customerService')
  return {
    ...actual,
    getCustomerProfile: vi.fn().mockResolvedValue({
      qid_document_path: null,
      drivers_license_path: null,
    }),
    getBillingAddress: vi.fn().mockResolvedValue({
      line1: '',
      line2: '',
      city: '',
      country: '',
      postalCode: '',
    }),
    createBookingRequest: vi.fn(),
    updateCustomerDocuments: vi.fn(),
    updateBillingAddress: vi.fn(),
    validatePromoCode: vi.fn(),
    getUnreadNotificationCount: vi.fn().mockResolvedValue(0),
    getUnreadMessageCount: vi.fn().mockResolvedValue(0),
    listInvoices: vi.fn().mockResolvedValue([]),
  }
})

describe('CheckoutPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('UI-C-CHK-01: renders checkout sections from mock', () => {
    renderWithProviders(<CheckoutPage />)
    expect(screen.getByText('Personal Information')).toBeInTheDocument()
    expect(screen.getByText(/Driver's License Information/i)).toBeInTheDocument()
    expect(screen.getByText('Billing Address')).toBeInTheDocument()
    expect(screen.getByText(/Delivery & pickup/i)).toBeInTheDocument()
    expect(screen.getByText('Emergency Contact')).toBeInTheDocument()
    expect(screen.getByText('Order Summary')).toBeInTheDocument()
    expect(screen.getByText('Need Help?')).toBeInTheDocument()
  })

  it('UI-C-CHK-02: shows personal info fields and continue CTA', () => {
    renderWithProviders(<CheckoutPage />)
    expect(screen.getByText(/First Name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continue/i })).toBeInTheDocument()
  })

  it('UI-C-CHK-03: shows inline errors for invalid Qatar phone and QID', async () => {
    renderWithProviders(<CheckoutPage />)

    fireEvent.change(screen.getByPlaceholderText('+974 5555 1234'), { target: { value: '+9745000' } })
    fireEvent.change(screen.getByPlaceholderText('28412345678'), { target: { value: '123' } })
    fireEvent.change(screen.getByPlaceholderText('12345678'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Subscription Agreement/i }))

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))

    await waitFor(() => {
      expect(screen.getByText(/Enter a valid Qatar phone number/i)).toBeInTheDocument()
      expect(screen.getByText(/Qatar ID must be exactly 11 digits/i)).toBeInTheDocument()
      expect(screen.getByText(/Driver's license number must be 8 digits/i)).toBeInTheDocument()
    })
    expect(createBookingRequest).not.toHaveBeenCalled()
  })

  it('UI-C-CHK-04: blocks submission until the legal consent box is ticked', async () => {
    renderWithProviders(<CheckoutPage />)

    const consent = screen.getByRole('checkbox', { name: /Subscription Agreement/i })
    expect(consent).not.toBeChecked()
    expect(screen.getByRole('button', { name: /Continue/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /Continue/i }))
    await waitFor(() => {
      expect(createBookingRequest).not.toHaveBeenCalled()
    })
    expect(recordConsentsSafely).not.toHaveBeenCalled()

    fireEvent.click(consent)
    expect(consent).toBeChecked()
    expect(screen.getByRole('button', { name: /Continue/i })).toBeEnabled()
  })

  it('UI-C-CHK-05: links the consent box to every legal document', () => {
    renderWithProviders(<CheckoutPage />)

    // Scoped to the consent label — the footer links to the same documents.
    const consentLabel = screen
      .getByRole('checkbox', { name: /Subscription Agreement/i })
      .closest('label') as HTMLElement
    const hrefs = within(consentLabel)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))

    expect(hrefs).toEqual(['/rental-agreement', '/terms', '/refund-policy', '/privacy'])
  })
})