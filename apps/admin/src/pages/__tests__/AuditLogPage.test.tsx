import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as adminService from '../../services/adminService'
import { renderWithProviders } from '../../test/render'
import { AuditLogPage } from '../AuditLogPage'

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
  return { ...actual, listAuditLogs: vi.fn() }
})

describe('AuditLogPage', () => {
  beforeEach(() => {
    vi.mocked(adminService.listAuditLogs).mockResolvedValue({
      items: [
        {
          id: 'log_1',
          action: 'customer.status.change',
          entityType: 'profile',
          entityId: 'cust_1',
          createdAt: '2026-01-01T00:00:00.000Z',
          actorName: 'Admin',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
    })
  })

  it('ADM-UI-11: renders audit log entries', async () => {
    renderWithProviders(<AuditLogPage />)
    await waitFor(() => {
      expect(screen.getByText(/customer.status.change/i)).toBeInTheDocument()
    })
  })
})
