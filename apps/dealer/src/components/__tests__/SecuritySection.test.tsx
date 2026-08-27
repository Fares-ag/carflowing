import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as securityService from '../../services/securityService'
import { renderWithProviders } from '../../test/render'
import { SecuritySection } from '../SecuritySection'

vi.mock('../../services/securityService', () => ({
  getSecurityStatus: vi.fn(),
  setup2fa: vi.fn(),
  enable2fa: vi.fn(),
  disable2fa: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

const OFF = {
  totpEnabled: false,
  totpRequired: false,
  smsVerified: false,
  smsPhone: null,
  smsVerificationAvailable: false,
  smsProviderConfigured: false,
  smsDevFallback: true,
}

describe('Dealer SecuritySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(securityService.getSecurityStatus).mockResolvedValue(OFF)
    vi.mocked(securityService.setup2fa).mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      uri: 'otpauth://totp/CarFlow%3Adealer%40carflow.qa?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=CarFlow&digits=6&period=30',
    })
    vi.mocked(securityService.enable2fa).mockResolvedValue({ ok: true })
  })

  it('UI-D-2FA-01: shows the current enrolment state', async () => {
    renderWithProviders(<SecuritySection email="dealer@carflow.qa" />)
    await waitFor(() => expect(screen.getByText('Not enabled')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /enable two-factor authentication/i })).toBeInTheDocument()
  })

  it('UI-D-2FA-02: enrolment renders a QR plus the setup key, then verifies a code', async () => {
    renderWithProviders(<SecuritySection email="dealer@carflow.qa" />)
    await waitFor(() => expect(screen.getByText('Not enabled')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /enable two-factor authentication/i }))

    await waitFor(() =>
      expect(screen.getByText('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP')).toBeInTheDocument()
    )
    const qr = screen.getByRole('img', { name: /setup qr code/i })
    expect(qr.querySelector('svg')).not.toBeNull()

    // The confirm button stays disabled until a full 6-digit code is entered.
    const confirm = screen.getByRole('button', { name: /confirm & enable/i })
    expect(confirm).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/authentication code/i), { target: { value: '123456' } })
    expect(confirm).not.toBeDisabled()

    vi.mocked(securityService.getSecurityStatus).mockResolvedValue({ ...OFF, totpEnabled: true })
    fireEvent.click(confirm)

    await waitFor(() => expect(securityService.enable2fa).toHaveBeenCalledWith('123456'))
    await waitFor(() => expect(screen.getByText('Enabled')).toBeInTheDocument())
  })

  it('UI-D-2FA-03: non-numeric input is stripped and the code is capped at 6 digits', async () => {
    renderWithProviders(<SecuritySection />)
    await waitFor(() => expect(screen.getByText('Not enabled')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: /enable two-factor authentication/i }))
    await waitFor(() => expect(screen.getByLabelText(/authentication code/i)).toBeInTheDocument())

    const input = screen.getByLabelText(/authentication code/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'a1b2c3d4e5f6g7' } })
    expect(input.value).toBe('123456')
  })

  it('UI-D-2FA-04: a mandatory-2FA account is warned and cannot disable', async () => {
    vi.mocked(securityService.getSecurityStatus).mockResolvedValue({
      ...OFF,
      totpEnabled: true,
      totpRequired: true,
    })
    renderWithProviders(<SecuritySection />)
    await waitFor(() => expect(screen.getByText('Enabled')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^disable$/i })).toBeDisabled()
  })
})
