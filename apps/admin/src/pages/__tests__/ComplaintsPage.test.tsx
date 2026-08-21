import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as adminService from '../../services/adminService'
import { renderWithProviders } from '../../test/render'
import { ComplaintsPage } from '../ComplaintsPage'

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
  return { ...actual, listComplaints: vi.fn(), listComplaintReplies: vi.fn() }
})

describe('ComplaintsPage', () => {
  beforeEach(() => {
    vi.mocked(adminService.listComplaints).mockResolvedValue({
      items: [
        {
          id: 'cmp1',
          customerId: 'c1',
          category: 'billing',
          priority: 'high',
          status: 'open',
          subject: 'Overcharge',
          description: 'Charged twice',
          createdAt: '2026-01-01',
          customerName: 'Chris Customer',
          customerEmail: 'customer@carflow.dev',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 50,
    })
    vi.mocked(adminService.listComplaintReplies).mockResolvedValue([])
  })

  it('ADM-UI-15: renders complaints list', async () => {
    renderWithProviders(<ComplaintsPage />)
    await waitFor(() => {
      expect(screen.getByText('Overcharge')).toBeInTheDocument()
    })
  })
})
