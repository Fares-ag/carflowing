import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as customerService from '../../../services/customerService'
import { renderWithProviders } from '../../../test/render'
import SupportSection from '../SupportSection'

vi.mock('../../../services/customerService', async () => {
  const actual = await vi.importActual<typeof customerService>('../../../services/customerService')
  return {
    ...actual,
    listMyComplaints: vi.fn(),
    submitComplaint: vi.fn(),
  }
})

vi.mock('../../../hooks/useToast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('SupportSection', () => {
  beforeEach(() => {
    vi.mocked(customerService.listMyComplaints).mockResolvedValue({
      items: [
        {
          id: 'c1',
          customerId: 'cust_1',
          category: 'billing',
          priority: 'medium',
          status: 'in_progress',
          subject: 'Invoice question',
          description: 'Need help with July invoice.',
          createdAt: '2026-08-01T00:00:00.000Z',
          replies: [
            {
              id: 'r1',
              body: 'We are reviewing your invoice now.',
              createdAt: '2026-08-02T10:00:00.000Z',
              authorName: 'Support Agent',
              fromSupport: true,
            },
          ],
        },
      ],
    })
  })

  it('UI-C-SUP-01: shows complaint thread with support reply', async () => {
    renderWithProviders(<SupportSection />)
    await waitFor(() => {
      expect(screen.getByText('Invoice question')).toBeInTheDocument()
    })
    expect(screen.getByText(/We are reviewing your invoice now/i)).toBeInTheDocument()
    expect(screen.getByText('CarFlow support')).toBeInTheDocument()
    expect(screen.getByText('In progress')).toBeInTheDocument()
  })
})
