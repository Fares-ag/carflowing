import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as adminService from '../../services/adminService'
import { renderWithProviders } from '../../test/render'
import { SettingsPage } from '../SettingsPage'

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
  return {
    ...actual,
    getAppSettings: vi.fn(),
    getBusinessSettings: vi.fn(),
    getFeatureFlags: vi.fn(),
    updateAppSettings: vi.fn(),
    updateBusinessSettings: vi.fn(),
    updateFeatureFlags: vi.fn(),
  }
})

const business = {
  platformCommissionRate: 0.1,
  billingGraceDays: 3,
  paymentHoldTtlMinutes: 45,
  cancelNoticeDays: 30,
  swapEligibleDays: 30,
  subscriptionDepositAmount: 0,
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const flags = {
  checkoutEnabled: true,
  onlinePaymentsEnabled: true,
  signupsEnabled: true,
  dealerSignupsEnabled: true,
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('SettingsPage contract', () => {
  beforeEach(() => {
    vi.mocked(adminService.getAppSettings).mockResolvedValue({
      id: 'settings_1',
      companyName: 'CarFlow',
      supportEmail: 'support@carflow.dev',
      supportPhone: '+974 0000',
      ...business,
      signupsEnabled: true,
      onlinePaymentsEnabled: true,
      newBookingsEnabled: true,
    })
    vi.mocked(adminService.getBusinessSettings).mockResolvedValue(business)
    vi.mocked(adminService.getFeatureFlags).mockResolvedValue(flags)
    vi.mocked(adminService.updateAppSettings).mockResolvedValue({
      id: 'settings_1',
      companyName: 'CarFlow QA',
      supportEmail: 'support@carflow.dev',
      supportPhone: '+974 0000',
      ...business,
      signupsEnabled: true,
      onlinePaymentsEnabled: true,
      newBookingsEnabled: true,
    })
    vi.mocked(adminService.updateBusinessSettings).mockResolvedValue({
      ...business,
      platformCommissionRate: 0.12,
    })
    vi.mocked(adminService.updateFeatureFlags).mockResolvedValue({
      ...flags,
      onlinePaymentsEnabled: false,
    })
  })

  it('A-QA-001: company save calls updateAppSettings without business knobs or flags', async () => {
    renderWithProviders(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('CarFlow')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByDisplayValue('CarFlow'), { target: { value: 'CarFlow QA' } })
    fireEvent.click(screen.getByRole('button', { name: /save company/i }))

    await waitFor(() => {
      expect(adminService.updateAppSettings).toHaveBeenCalledWith({
        companyName: 'CarFlow QA',
        supportEmail: 'support@carflow.dev',
        supportPhone: '+974 0000',
      })
    })
  })

  it('A-QA-002: business save requires confirmation then calls updateBusinessSettings', async () => {
    renderWithProviders(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('0.1')).toBeInTheDocument()
    })

    fireEvent.change(screen.getByDisplayValue('0.1'), { target: { value: '0.12' } })
    fireEvent.click(screen.getByRole('button', { name: /save business rules/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /confirm and apply/i }))

    await waitFor(() => {
      expect(adminService.updateBusinessSettings).toHaveBeenCalledWith({
        platformCommissionRate: 0.12,
        billingGraceDays: 3,
        paymentHoldTtlMinutes: 45,
        cancelNoticeDays: 30,
        swapEligibleDays: 30,
        subscriptionDepositAmount: 0,
      })
    })
  })

  it('A-QA-003: kill switch save requires confirmation then calls updateFeatureFlags', async () => {
    renderWithProviders(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByLabelText(/online payments/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByLabelText(/online payments/i))
    fireEvent.click(screen.getByRole('button', { name: /apply kill switches/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /confirm and apply/i }))

    await waitFor(() => {
      expect(adminService.updateFeatureFlags).toHaveBeenCalledWith({
        checkoutEnabled: true,
        onlinePaymentsEnabled: false,
        signupsEnabled: true,
        dealerSignupsEnabled: true,
      })
    })
  })
})
