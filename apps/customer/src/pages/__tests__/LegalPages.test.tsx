import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { LEGAL_DOCUMENTS } from '../../constants/legal'
import { PrivacyPage, RefundPolicyPage, RentalAgreementPage, TermsPage } from '../LegalPages'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: null,
    isLoading: false,
    refetch: async () => undefined,
    logout: async () => undefined,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

describe('Legal pages', () => {
  it('UI-C-LEGAL-01: privacy notice carries every PDPPL heading a Qatar notice needs', () => {
    renderWithProviders(<PrivacyPage />)

    const headings = screen
      .getAllByRole('heading', { level: 2 })
      .map((node) => node.textContent ?? '')
    for (const section of LEGAL_DOCUMENTS.privacy.sections) {
      expect(headings.some((text) => text.includes(section.heading))).toBe(true)
    }
    // Controller identity, purposes, legal basis, retention, sharing, rights, contact.
    expect(screen.getByRole('heading', { name: /Who controls your personal data/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Our legal basis for processing/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /How long we keep your data/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Who we share your data with/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Your rights/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /How to contact us/i })).toBeInTheDocument()
  })

  it('UI-C-LEGAL-02: every body paragraph is visibly marked as an unreviewed placeholder', () => {
    for (const [name, Page] of [
      ['terms', TermsPage],
      ['privacy', PrivacyPage],
      ['refund_policy', RefundPolicyPage],
      ['rental_agreement', RentalAgreementPage],
    ] as const) {
      const { unmount } = renderWithProviders(<Page />)
      const doc = LEGAL_DOCUMENTS[name]
      expect(screen.getAllByText('PLACEHOLDER — pending legal review')).toHaveLength(
        doc.sections.length
      )
      expect(screen.getByText(/still a placeholder awaiting legal review/i)).toBeInTheDocument()
      unmount()
    }
  })

  it('UI-C-LEGAL-03: cross-links the other documents', () => {
    renderWithProviders(<TermsPage />)

    const related = screen.getByRole('navigation', { name: /Other legal documents/i })
    expect(related).toHaveTextContent('Privacy Notice')
    expect(related).toHaveTextContent('Cancellation & Refund Policy')
    expect(related).toHaveTextContent('Subscription (Rental) Agreement')
  })
})
