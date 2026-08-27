import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import * as dealerService from '../../services/dealerService'
import { renderWithProviders } from '../../test/render'
import { SubscriptionBilling } from '../SubscriptionBilling'

vi.mock('../../components/Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar-stub" /> }))
vi.mock('../../components/Header', () => ({ Header: () => <div data-testid="header-stub" /> }))

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}))

vi.mock('../../services/dealerService', () => ({
  getDealerBillingState: vi.fn(),
  listDealerBillingInvoices: vi.fn(),
  listDealerBillingPlans: vi.fn(),
  listPaymentMethods: vi.fn(),
  removePaymentMethod: vi.fn(),
  changeDealerSubscriptionPlan: vi.fn(),
  cancelDealerSubscription: vi.fn(),
}))

const growthPlan = {
  id: 'dplan_growth',
  code: 'growth',
  name: 'Growth',
  priceQar: 750,
  vehicleLimit: 25,
  features: ['Up to 25 vehicles', 'Priority support'],
  active: true,
}

const scalePlan = {
  id: 'dplan_scale',
  code: 'scale',
  name: 'Scale',
  priceQar: 1500,
  vehicleLimit: null,
  features: ['Unlimited vehicles'],
  active: true,
}

const subscription = {
  id: 'dsub_1',
  dealerId: 'dealer_1',
  planId: growthPlan.id,
  planCode: growthPlan.code,
  planName: growthPlan.name,
  priceQar: growthPlan.priceQar,
  vehicleLimit: 25,
  status: 'active' as const,
  currentPeriodStart: '2026-08-01',
  currentPeriodEnd: '2026-09-01',
  createdAt: '2026-01-01T00:00:00.000Z',
}

const paidInvoice = {
  id: 'dinv_1',
  dealerId: 'dealer_1',
  subscriptionId: 'dsub_1',
  amount: 750,
  status: 'paid' as const,
  date: '2026-07-01',
  description: 'Growth subscription 2026-07-01 to 2026-08-01',
  periodStart: '2026-07-01',
  periodEnd: '2026-08-01',
  dueDate: '2026-07-04',
  paidAt: '2026-07-02T09:00:00.000Z',
}

const dueInvoice = {
  ...paidInvoice,
  id: 'dinv_2',
  status: 'due' as const,
  date: '2026-08-01',
  description: 'Growth subscription 2026-08-01 to 2026-09-01',
  periodStart: '2026-08-01',
  periodEnd: '2026-09-01',
  dueDate: '2026-08-04',
  paidAt: undefined,
}

const quotaWithHeadroom = {
  planId: growthPlan.id,
  planCode: growthPlan.code,
  planName: growthPlan.name,
  limit: 25,
  used: 18,
  remaining: 7,
  overLimit: false,
  enforced: true,
}

const quotaAtCap = { ...quotaWithHeadroom, used: 25, remaining: 0 }

describe('Dealer SubscriptionBilling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(dealerService.getDealerBillingState).mockResolvedValue({
      subscription,
      plan: growthPlan,
      quota: quotaWithHeadroom,
    })
    vi.mocked(dealerService.listDealerBillingInvoices).mockResolvedValue([dueInvoice, paidInvoice])
    vi.mocked(dealerService.listDealerBillingPlans).mockResolvedValue([growthPlan, scalePlan])
    vi.mocked(dealerService.listPaymentMethods).mockResolvedValue([])
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('UI-D-BILL-01: shows the real current plan instead of a hardcoded tier and price', async () => {
    renderWithProviders(<SubscriptionBilling />)
    await waitFor(() => expect(screen.getByText('Growth Plan')).toBeInTheDocument())
    expect(screen.getAllByText('QAR 750').length).toBeGreaterThan(0)
    // The page used to fall back to a fabricated "Professional Plan" at 299.
    expect(screen.queryByText(/Professional Plan/)).not.toBeInTheDocument()
    expect(screen.queryByText('QAR 299')).not.toBeInTheDocument()
  })

  it('UI-D-BILL-02: renders real invoice history rather than an always-empty list', async () => {
    renderWithProviders(<SubscriptionBilling />)
    await waitFor(() =>
      expect(screen.getByText('Growth subscription 2026-08-01 to 2026-09-01')).toBeInTheDocument()
    )
    expect(screen.getByText('Growth subscription 2026-07-01 to 2026-08-01')).toBeInTheDocument()
    expect(dealerService.listDealerBillingInvoices).toHaveBeenCalled()
  })

  it('UI-D-BILL-03: surfaces outstanding invoices so an upgrade is visibly unpaid', async () => {
    renderWithProviders(<SubscriptionBilling />)
    await waitFor(() =>
      expect(screen.getByText(/QAR 750 outstanding across 1 invoice/)).toBeInTheDocument()
    )
  })

  it('UI-D-BILL-04: surfaces the real remaining quota from the API', async () => {
    renderWithProviders(<SubscriptionBilling />)
    await waitFor(() => expect(screen.getByText('18 / 25')).toBeInTheDocument())
    expect(screen.getByText(/7 listing\(s\) remaining on Growth/)).toBeInTheDocument()
  })

  it('UI-D-BILL-05: says so clearly when the dealer is at their plan cap', async () => {
    vi.mocked(dealerService.getDealerBillingState).mockResolvedValue({
      subscription,
      plan: growthPlan,
      quota: quotaAtCap,
    })
    renderWithProviders(<SubscriptionBilling />)
    await waitFor(() => expect(screen.getByText('25 / 25')).toBeInTheDocument())
    expect(screen.getByText(/at your plan cap/i)).toBeInTheDocument()
  })

  it('UI-D-BILL-06: an upgrade is confirmed as billable and reports the raised invoice', async () => {
    const upgradeInvoice = {
      ...dueInvoice,
      id: 'dinv_3',
      amount: 500,
      description: 'Scale subscription 2026-08-15 to 2026-09-01',
      dueDate: '2026-08-18',
    }
    vi.mocked(dealerService.changeDealerSubscriptionPlan).mockResolvedValue({
      subscription: {
        ...subscription,
        planId: scalePlan.id,
        planName: 'Scale',
        priceQar: 1500,
        vehicleLimit: null,
      },
      plan: scalePlan,
      invoice: upgradeInvoice,
      change: 'upgraded',
      deactivatedVehicles: 0,
      quota: { ...quotaWithHeadroom, planName: 'Scale', limit: null, remaining: null, enforced: false },
    })
    const confirmSpy = vi.fn(() => true)
    vi.stubGlobal('confirm', confirmSpy)

    renderWithProviders(<SubscriptionBilling />)
    await waitFor(() => expect(screen.getByText('Scale')).toBeInTheDocument())

    const buttons = screen.getAllByRole('button', { name: /choose plan/i })
    fireEvent.click(buttons[buttons.length - 1])

    // The dealer must be told the tier is invoiced, not granted for free.
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('raises an invoice'))
    await waitFor(() =>
      expect(dealerService.changeDealerSubscriptionPlan).toHaveBeenCalledWith(scalePlan.id)
    )
    const { toast } = await import('sonner')
    await waitFor(() =>
      // NB: Intl currency output uses a non-breaking space, so match the parts.
      expect(toast.warning).toHaveBeenCalledWith(
        expect.stringMatching(/Scale is active..*500.*due by Aug 18, 2026/)
      )
    )
  })

  it('UI-D-BILL-07: declining the confirmation makes no plan change', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    renderWithProviders(<SubscriptionBilling />)
    await waitFor(() => expect(screen.getByText('Scale')).toBeInTheDocument())

    const buttons = screen.getAllByRole('button', { name: /choose plan/i })
    fireEvent.click(buttons[buttons.length - 1])

    expect(dealerService.changeDealerSubscriptionPlan).not.toHaveBeenCalled()
  })

  it('UI-D-BILL-08: the current plan cannot be re-purchased', async () => {
    renderWithProviders(<SubscriptionBilling />)
    await waitFor(() => expect(screen.getByRole('button', { name: /current plan/i })).toBeDisabled())
  })
})
