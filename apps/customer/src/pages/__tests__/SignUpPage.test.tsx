import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { renderWithProviders } from '../../test/render'
import { SignUpPage } from '../SignUpPage'
import { signUp } from '../../services/authService'
import { recordConsentsSafely } from '../../services/consentService'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    session: null,
    isLoading: false,
    refetch: async () => undefined,
    logout: async () => undefined,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

vi.mock('../../services/authService', () => ({
  signUp: vi.fn(),
}))

vi.mock('../../services/consentService', () => ({
  recordConsents: vi.fn(),
  recordConsentsSafely: vi.fn().mockResolvedValue(undefined),
}))

function fillValidForm() {
  fireEvent.change(screen.getByPlaceholderText('Your name'), { target: { value: 'Sara Ali' } })
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
    target: { value: 'sara@example.com' },
  })
  fireEvent.change(screen.getByPlaceholderText(/At least/i), { target: { value: 'Password123' } })
  fireEvent.change(screen.getByPlaceholderText('Repeat password'), {
    target: { value: 'Password123' },
  })
}

describe('SignUpPage legal consent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(signUp).mockResolvedValue({
      userId: '1',
      role: 'customer',
      name: 'Sara Ali',
      email: 'sara@example.com',
    })
  })

  it('UI-C-SIGNUP-01: blocks account creation until the consent box is ticked', async () => {
    renderWithProviders(<SignUpPage />)
    fillValidForm()

    const submit = screen.getByRole('button', { name: /Create account/i })
    expect(submit).toBeDisabled()

    fireEvent.click(submit)
    await waitFor(() => {
      expect(signUp).not.toHaveBeenCalled()
    })
  })

  it('UI-C-SIGNUP-02: records the accepted documents once consent is given', async () => {
    renderWithProviders(<SignUpPage />)
    fillValidForm()
    fireEvent.click(screen.getByRole('checkbox', { name: /Terms of Service/i }))

    const submit = screen.getByRole('button', { name: /Create account/i })
    expect(submit).toBeEnabled()
    fireEvent.click(submit)

    await waitFor(() => {
      expect(signUp).toHaveBeenCalledTimes(1)
    })
    expect(recordConsentsSafely).toHaveBeenCalledWith(['terms', 'privacy'])
  })

  it('UI-C-SIGNUP-03: links the consent box to the terms and privacy pages', () => {
    renderWithProviders(<SignUpPage />)

    // Scoped to the consent label — the footer links to the same documents.
    const consentLabel = screen
      .getByRole('checkbox', { name: /Terms of Service/i })
      .closest('label') as HTMLElement
    const hrefs = within(consentLabel)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))

    expect(hrefs).toEqual(['/terms', '/privacy'])
  })
})
