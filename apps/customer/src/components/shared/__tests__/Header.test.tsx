import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as customerService from '../../../services/customerService'
import { renderWithProviders } from '../../../test/render'
import { Header } from '../Header'

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { userId: '1', role: 'customer', name: 'Customer', email: 'customer@carflow.dev' },
    isLoading: false,
    refetch: async () => undefined,
    logout: async () => undefined,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../../services/customerService', async () => {
  const actual = await vi.importActual<typeof customerService>('../../../services/customerService')
  return {
    ...actual,
    getUnreadNotificationCount: vi.fn(),
    getUnreadMessageCount: vi.fn(),
    listInvoices: vi.fn(),
  }
})

describe('Header notifications', () => {
  beforeEach(() => {
    vi.mocked(customerService.getUnreadNotificationCount).mockResolvedValue(2)
    vi.mocked(customerService.getUnreadMessageCount).mockResolvedValue(0)
    vi.mocked(customerService.listInvoices).mockResolvedValue([])
  })

  it('UI-C-HDR-01: shows notification bell with unread badge when signed in', async () => {
    renderWithProviders(<Header />)
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Notifications, 2 unread/i })).toBeInTheDocument()
    })
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('UI-C-HDR-02: shows overdue banner and account badge when invoices are overdue', async () => {
    vi.mocked(customerService.listInvoices).mockResolvedValue([
      {
        id: 'inv_1',
        ownerId: '1',
        ownerType: 'customer',
        amount: 1500,
        status: 'overdue',
        date: '2026-01-01',
        description: 'Monthly subscription',
      },
    ])

    renderWithProviders(<Header />)

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/overdue invoice/i)
    })
    expect(screen.getByRole('link', { name: /Pay now/i })).toHaveAttribute('href', '/settings?section=billing')
    expect(screen.getByLabelText('1 overdue invoices')).toBeInTheDocument()
  })
})
