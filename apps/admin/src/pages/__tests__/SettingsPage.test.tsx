import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { SettingsPage } from '../SettingsPage'
import { renderWithProviders } from '../../test/render'
import * as adminService from '../../services/adminService'

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
    updateAppSettings: vi.fn(),
  }
})

describe('SettingsPage contract', () => {
  beforeEach(() => {
    vi.mocked(adminService.getAppSettings).mockResolvedValue({
      id: 'settings_1',
      companyName: 'CarFlow',
      supportEmail: 'support@carflow.dev',
      supportPhone: '+974 0000',
      defaultTaxRate: 0.05,
    })
    vi.mocked(adminService.updateAppSettings).mockResolvedValue({
      id: 'settings_1',
      companyName: 'CarFlow QA',
      supportEmail: 'support@carflow.dev',
      supportPhone: '+974 0000',
      defaultTaxRate: 0.05,
    })
  })

  it('A-QA-001: save calls updateAppSettings with a single updates object', async () => {
    renderWithProviders(<SettingsPage />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('CarFlow')).toBeInTheDocument()
    })

    const companyInput = screen.getByDisplayValue('CarFlow')
    fireEvent.change(companyInput, { target: { value: 'CarFlow QA' } })
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))

    await waitFor(() => {
      expect(adminService.updateAppSettings).toHaveBeenCalledWith({
        companyName: 'CarFlow QA',
        supportEmail: 'support@carflow.dev',
        supportPhone: '+974 0000',
        defaultTaxRate: 0.05,
      })
    })
    expect(adminService.updateAppSettings).toHaveBeenCalledTimes(1)
  })
})
