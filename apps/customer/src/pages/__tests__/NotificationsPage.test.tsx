import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as customerService from '../../services/customerService'
import { renderWithProviders } from '../../test/render'
import { NotificationsPage } from '../NotificationsPage'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { userId: '1', role: 'customer', name: 'Customer', email: 'customer@carflow.dev' },
    isLoading: false,
    refetch: async () => undefined,
    logout: async () => undefined,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../components/shared/Header', () => ({
  Header: () => <div data-testid="header-stub" />,
}))

vi.mock('../../components/shared/Footer', () => ({
  Footer: () => <div data-testid="footer-stub" />,
}))

vi.mock('../../services/customerService', async () => {
  const actual = await vi.importActual<typeof customerService>('../../services/customerService')
  return {
    ...actual,
    listNotifications: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  }
})

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.mocked(customerService.listNotifications).mockResolvedValue({
      items: [
        {
          id: 'n1',
          userId: '1',
          type: 'info',
          title: 'Payment due in 3 days',
          message: 'Your subscription payment is due soon.',
          read: false,
          createdAt: '2026-08-10T09:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    })
    vi.mocked(customerService.markNotificationRead).mockResolvedValue(undefined)
    vi.mocked(customerService.markAllNotificationsRead).mockResolvedValue(undefined)
  })

  it('UI-C-NOTIF-01: renders notification items', async () => {
    renderWithProviders(<NotificationsPage />)
    await waitFor(() => {
      expect(screen.getByText('Payment due in 3 days')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /Mark all read/i })).toBeInTheDocument()
  })

  it('UI-C-NOTIF-02: mark read calls customer service', async () => {
    renderWithProviders(<NotificationsPage />)
    await waitFor(() => {
      expect(screen.getByText('Payment due in 3 days')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByRole('button', { name: /Mark read/i }))
    await waitFor(() => {
      expect(customerService.markNotificationRead).toHaveBeenCalledWith('n1')
    })
  })
})
