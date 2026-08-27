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

describe('Admin SecuritySection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(securityService.getSecurityStatus).mockResolvedValue(OFF)
    vi.mocked(securityService.setup2fa).mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
      uri: 'otpauth://totp/CarFlow%3Aadmin%40carflow.dev?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=CarFlow&digits=6&period=30',
    })
    vi.mocked(securityService.enable2fa).mockResolvedValue({ ok: true })
  })

  it('ADM-UI-2FA-01: staff can see their enrolment state', async () => {
    renderWithProviders(<SecuritySection email="admin@carflow.dev" />)
    await waitFor(() => expect(screen.getByText('2FA not enabled')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /enable two-factor authentication/i })).toBeInTheDocument()
  })

  it('ADM-UI-2FA-02: enrolment renders a QR plus the setup key, then verifies a code', async () => {
    renderWithProviders(<SecuritySection email="admin@carflow.dev" />)
    await waitFor(() => expect(screen.getByText('2FA not enabled')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /enable two-factor authentication/i }))
    await waitFor(() =>
      expect(screen.getByText('JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP')).toBeInTheDocument()
    )
    expect(screen.getByRole('img', { name: /setup qr code/i }).querySelector('svg')).not.toBeNull()

    const confirm = screen.getByRole('button', { name: /confirm & enable/i })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/authentication code/i), { target: { value: '654321' } })

    vi.mocked(securityService.getSecurityStatus).mockResolvedValue({ ...OFF, totpEnabled: true })
    fireEvent.click(confirm)

    await waitFor(() => expect(securityService.enable2fa).toHaveBeenCalledWith('654321'))
    await waitFor(() => expect(screen.getByText('2FA enabled')).toBeInTheDocument())
  })

  it('ADM-UI-2FA-03: mandatory staff 2FA is warned about and cannot be turned off here', async () => {
    vi.mocked(securityService.getSecurityStatus).mockResolvedValue({ ...OFF, totpRequired: true })
    renderWithProviders(<SecuritySection email="admin@carflow.dev" />)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/required for staff accounts/i)
    )
  })
})
