import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { MessagesPage } from '../MessagesPage'
import { renderWithProviders } from '../../test/render'
import * as adminService from '../../services/adminService'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: { userId: 'admin_1', role: 'admin', name: 'Admin', email: 'admin@carflow.dev' },
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
    listMessages: vi.fn(),
    getMessageFolderCounts: vi.fn(),
    listMessagesActivitySample: vi.fn(),
    listCustomers: vi.fn(),
    createMessage: vi.fn(),
  }
})

describe('MessagesPage compose contract', () => {
  beforeEach(() => {
    vi.mocked(adminService.listMessages).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 50 })
    vi.mocked(adminService.getMessageFolderCounts).mockResolvedValue({
      inbox: 0,
      sent: 0,
      starred: 0,
      archived: 0,
      unread: 0,
    })
    vi.mocked(adminService.listMessagesActivitySample).mockResolvedValue([])
    vi.mocked(adminService.listCustomers).mockResolvedValue({
      items: [
        {
          id: 'cust_abc',
          name: 'Chris Customer',
          email: 'customer@carflow.dev',
          role: 'customer',
          createdAt: '2025-01-01',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 100,
    })
    vi.mocked(adminService.createMessage).mockResolvedValue({
      id: 'msg_1',
      fromUserId: 'admin_1',
      toUserId: 'cust_abc',
      subject: 'Hello',
      body: 'Test body',
      folder: 'sent',
      read: false,
      createdAt: new Date().toISOString(),
    })
  })

  it('A-QA-002: compose resolves email to toUserId before createMessage', async () => {
    renderWithProviders(<MessagesPage />)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /compose message/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /compose message/i }))
    fireEvent.change(screen.getByPlaceholderText(/recipient email or user id/i), {
      target: { value: 'customer@carflow.dev' },
    })
    fireEvent.change(screen.getByPlaceholderText(/^subject$/i), { target: { value: 'Hello' } })
    fireEvent.change(screen.getByPlaceholderText(/write your message/i), {
      target: { value: 'Test body' },
    })
    fireEvent.click(screen.getByRole('button', { name: /send message/i }))

    await waitFor(() => {
      expect(adminService.createMessage).toHaveBeenCalledWith('admin_1', {
        toUserId: 'cust_abc',
        subject: 'Hello',
        body: 'Test body',
      })
    })
  })
})
