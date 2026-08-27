import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as dealerService from '../../services/dealerService'
import { renderWithProviders } from '../../test/render'
import { Inventory } from '../Inventory'

vi.mock('../../components/Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar-stub" /> }))
vi.mock('../../components/Header', () => ({ Header: () => <div data-testid="header-stub" /> }))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('../../services/dealerService', () => ({
  listInventory: vi.fn(),
  getDealerBillingState: vi.fn(),
  createVehicle: vi.fn(),
  updateVehicle: vi.fn(),
  updateVehicleStatus: vi.fn(),
}))

const subscription = {
  id: 'dsub_1',
  dealerId: 'dealer_1',
  planId: 'dplan_growth',
  planCode: 'growth',
  planName: 'Growth',
  priceQar: 750,
  vehicleLimit: 25,
  status: 'active' as const,
  currentPeriodStart: '2026-08-01',
  currentPeriodEnd: '2026-09-01',
  createdAt: '2026-01-01T00:00:00.000Z',
}

const plan = {
  id: 'dplan_growth',
  code: 'growth',
  name: 'Growth',
  priceQar: 750,
  vehicleLimit: 25,
  features: [],
  active: true,
}

const baseQuota = {
  planId: plan.id,
  planCode: plan.code,
  planName: plan.name,
  limit: 25,
  used: 18,
  remaining: 7,
  overLimit: false,
  enforced: true,
}

describe('Dealer Inventory plan cap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dealerService.listInventory).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 100,
    })
    vi.mocked(dealerService.getDealerBillingState).mockResolvedValue({
      subscription,
      plan,
      quota: baseQuota,
    })
  })

  it('UI-D-INV-01: shows the remaining listing quota from the API', async () => {
    renderWithProviders(<Inventory />)
    await waitFor(() => expect(screen.getByText(/18 of 25 listings used on Growth/)).toBeInTheDocument())
    expect(screen.getByText('7 listings remaining.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add vehicle/i })).not.toBeDisabled()
  })

  it('UI-D-INV-02: blocks Add Vehicle with a clear message once at the cap', async () => {
    vi.mocked(dealerService.getDealerBillingState).mockResolvedValue({
      subscription,
      plan,
      quota: { ...baseQuota, used: 25, remaining: 0 },
    })
    renderWithProviders(<Inventory />)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/at your plan cap/i)
    )
    expect(screen.getByRole('button', { name: /add vehicle/i })).toBeDisabled()
  })

  it('UI-D-INV-03: reports being over the cap after a downgrade', async () => {
    vi.mocked(dealerService.getDealerBillingState).mockResolvedValue({
      subscription,
      plan,
      quota: { ...baseQuota, used: 30, remaining: 0, overLimit: true },
    })
    renderWithProviders(<Inventory />)
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/5 over your plan cap/i)
    )
  })

  it('UI-D-INV-04: an unlimited plan shows no cap banner and never blocks adding', async () => {
    vi.mocked(dealerService.getDealerBillingState).mockResolvedValue({
      subscription: { ...subscription, vehicleLimit: null },
      plan: { ...plan, vehicleLimit: null },
      quota: { ...baseQuota, limit: null, remaining: null, enforced: false },
    })
    renderWithProviders(<Inventory />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add vehicle/i })).not.toBeDisabled()
    )
    expect(screen.queryByText(/listings used/)).not.toBeInTheDocument()
  })
})
