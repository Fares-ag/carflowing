import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../../test/render'
import { Footer } from '../Footer'

vi.mock('../../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: null,
    isLoading: false,
    refetch: async () => undefined,
    logout: async () => undefined,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('Footer legal and social links', () => {
  it('UI-C-FOOT-01: links every legal document instead of "contact us for details"', () => {
    renderWithProviders(<Footer />)

    expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute('href', '/terms')
    expect(screen.getByRole('link', { name: 'Privacy Notice' })).toHaveAttribute('href', '/privacy')
    expect(screen.getByRole('link', { name: 'Cancellation & Refund Policy' })).toHaveAttribute(
      'href',
      '/refund-policy'
    )
    expect(
      screen.getByRole('link', { name: 'Subscription (Rental) Agreement' })
    ).toHaveAttribute('href', '/rental-agreement')
    expect(screen.queryByText(/contact us for details/i)).not.toBeInTheDocument()
  })

  it('UI-C-FOOT-02: renders no social icons while none are configured', () => {
    renderWithProviders(<Footer />)

    expect(screen.queryByRole('link', { name: 'LinkedIn' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Facebook' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Instagram' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'YouTube' })).not.toBeInTheDocument()
  })

  it('UI-C-FOOT-03: no longer points dealer signup at the wrong domain', () => {
    renderWithProviders(<Footer />)

    const dealerLink = screen.getByRole('link', { name: /List your cars/i })
    expect(dealerLink.getAttribute('href')).not.toContain('carflow.ai')
  })
})
