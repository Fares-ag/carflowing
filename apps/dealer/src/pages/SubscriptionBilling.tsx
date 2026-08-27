import { formatCurrency, formatDate } from '@carflow/shared'
import {
  AlertTriangle,
  Check,
  CreditCard,
  Download,
  Gauge,
  Plus,
  Receipt,
  Settings,
  Star,
  X,
} from 'lucide-react'
import { useState, useCallback, useMemo, memo, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import {
  cancelDealerSubscription,
  changeDealerSubscriptionPlan,
  getDealerBillingState,
  listDealerBillingInvoices,
  listDealerBillingPlans,
  listPaymentMethods,
  removePaymentMethod,
  type DealerBillingInvoice,
  type DealerBillingPlan,
  type DealerBillingState,
} from '../services/dealerService'
import './SubscriptionBilling.css'

interface PaymentMethod {
  id: string
  type: 'visa' | 'mastercard'
  last4: string
  expiry: string
  isDefault: boolean
}

const BILLING_STORAGE_KEY = 'carflow-dealer-billing'

type BillingAddressForm = {
  companyName: string
  addressLine1: string
  city: string
  state: string
  postalCode: string
}

const EMPTY_BILLING: BillingAddressForm = {
  companyName: '',
  addressLine1: '',
  city: '',
  state: '',
  postalCode: '',
}

function loadBillingAddress(): BillingAddressForm {
  try {
    const raw = localStorage.getItem(BILLING_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BillingAddressForm>
      return { ...EMPTY_BILLING, ...parsed }
    }
  } catch {
    /* ignore */
  }
  return { ...EMPTY_BILLING }
}

/** Backend dates are plain `YYYY-MM-DD` in the billing timezone. */
function formatBillingDate(value: string | undefined | null): string {
  if (!value) return '—'
  const parsed = new Date(`${value}T12:00:00`)
  if (!Number.isFinite(parsed.getTime())) return value
  return formatDate(parsed)
}

function formatSubscriptionStatus(status: string | undefined): string {
  if (!status) return 'No subscription'
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const INVOICE_OPEN_STATUSES = new Set(['due', 'past_due'])

export const SubscriptionBilling = memo(function SubscriptionBilling() {
  const [showManageBillingModal, setShowManageBillingModal] = useState(false)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [invoices, setInvoices] = useState<DealerBillingInvoice[]>([])
  const [billing, setBilling] = useState<DealerBillingState | null>(null)
  const [availablePlans, setAvailablePlans] = useState<DealerBillingPlan[]>([])
  const [showAllInvoices, setShowAllInvoices] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [paymentActionError, setPaymentActionError] = useState<string | null>(null)
  const [billingAddress, setBillingAddress] = useState<BillingAddressForm>(() => loadBillingAddress())
  const [planActionBusy, setPlanActionBusy] = useState(false)
  const planSectionRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [state, invoiceRows, plans, methods] = await Promise.all([
        getDealerBillingState(),
        listDealerBillingInvoices(),
        listDealerBillingPlans(),
        listPaymentMethods(),
      ])
      setBilling(state)
      setInvoices(invoiceRows)
      setAvailablePlans(plans)
      setPaymentMethods(
        methods.map((method) => ({
          id: method.id,
          type: method.brand.toLowerCase() === 'mastercard' ? 'mastercard' : 'visa',
          last4: method.last4,
          expiry: `${String(method.expiryMonth).padStart(2, '0')}/${String(method.expiryYear).slice(-2)}`,
          isDefault: method.isDefault,
        }))
      )
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load subscription data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const subscription = billing?.subscription ?? null
  const currentPlan = billing?.plan ?? null
  const quota = billing?.quota ?? null

  /** Invoices the dealer still owes money on — the upgrade is not paid for yet. */
  const openInvoices = useMemo(
    () => invoices.filter((invoice) => INVOICE_OPEN_STATUSES.has(invoice.status)),
    [invoices]
  )
  const openInvoiceTotal = useMemo(
    () => openInvoices.reduce((sum, invoice) => sum + invoice.amount, 0),
    [openInvoices]
  )

  const quotaView = useMemo(() => {
    if (!quota) return null
    if (quota.limit === null) {
      return {
        label: 'Vehicle listings',
        countLabel: `${quota.used} / ∞`,
        percentage: 0,
        note: quota.planName
          ? `${quota.planName} includes unlimited listings.`
          : 'No dealer plan on file — listings are not capped.',
        tone: 'ok' as const,
      }
    }
    const percentage = quota.limit > 0 ? Math.min(100, Math.round((quota.used / quota.limit) * 100)) : 100
    if (quota.overLimit) {
      return {
        label: 'Vehicle listings',
        countLabel: `${quota.used} / ${quota.limit}`,
        percentage,
        note: `You have ${quota.used} listed vehicles but ${quota.planName ?? 'your plan'} allows ${quota.limit}. Deactivate ${quota.used - quota.limit} listing(s) or upgrade.`,
        tone: 'over' as const,
      }
    }
    if (quota.remaining === 0) {
      return {
        label: 'Vehicle listings',
        countLabel: `${quota.used} / ${quota.limit}`,
        percentage,
        note: `You are at your plan cap. Upgrade or deactivate a listing before adding another vehicle.`,
        tone: 'at-cap' as const,
      }
    }
    return {
      label: 'Vehicle listings',
      countLabel: `${quota.used} / ${quota.limit}`,
      percentage,
      note: `${quota.remaining} listing(s) remaining on ${quota.planName ?? 'your plan'}.`,
      tone: 'ok' as const,
    }
  }, [quota])

  const handleRemovePaymentMethod = useCallback(async (id: string) => {
    setPaymentActionError(null)
    try {
      await removePaymentMethod(id)
      setPaymentMethods((prev) => prev.filter((item) => item.id !== id))
    } catch (err) {
      setPaymentActionError(err instanceof Error ? err.message : 'Could not remove payment method')
    }
  }, [])

  const handleManageBilling = useCallback(() => {
    setShowManageBillingModal(true)
  }, [])

  const handleCloseManageBilling = useCallback(() => {
    setShowManageBillingModal(false)
  }, [])

  useEffect(() => {
    if (showManageBillingModal) {
      setBillingAddress(loadBillingAddress())
    }
  }, [showManageBillingModal])

  const handleDownloadInvoices = useCallback(
    (items: DealerBillingInvoice[]) => {
      const source = items.length ? items : invoices
      if (!source.length) {
        toast.error('No invoices to export yet.')
        return
      }
      const rows = source.map((invoice) => ({
        id: invoice.id,
        description: invoice.description,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        dueDate: invoice.dueDate,
        amount: String(invoice.amount),
        status: invoice.status,
      }))
      const headers = Object.keys(rows[0])
      const csv = [
        headers.join(','),
        ...rows.map((row) =>
          headers.map((header) => `"${String((row as Record<string, string>)[header] ?? '')}"`).join(',')
        ),
      ].join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.setAttribute('download', 'dealer-invoices.csv')
      document.body.appendChild(link)
      link.click()
      link.remove()
    },
    [invoices]
  )

  const handleUpgradePlan = useCallback(() => {
    planSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleChoosePlan = useCallback(
    async (plan: DealerBillingPlan) => {
      if (subscription?.planId === plan.id) return

      const isUpgrade = plan.priceQar > (currentPlan?.priceQar ?? 0)
      const confirmation = isUpgrade
        ? `Switch to ${plan.name} at ${formatCurrency(plan.priceQar)} per month?\n\nThe new tier applies immediately and CarFlow raises an invoice for it right away. If that invoice is not paid within the billing grace window your account drops back to the free tier.`
        : `Switch to ${plan.name} at ${formatCurrency(plan.priceQar)} per month?\n\nThis takes effect immediately with no refund for the current period, and any listings above the new cap are deactivated.`
      if (!window.confirm(confirmation)) return

      setPlanActionBusy(true)
      try {
        const result = await changeDealerSubscriptionPlan(plan.id)
        setBilling({ subscription: result.subscription, plan: result.plan, quota: result.quota })
        // Refresh the invoice list so the newly raised invoice is visible and
        // the dealer can see exactly what is now owed.
        setInvoices(await listDealerBillingInvoices())

        if (result.invoice) {
          toast.warning(
            `${result.plan.name} is active. Invoice for ${formatCurrency(result.invoice.amount)} is due by ${formatBillingDate(result.invoice.dueDate)}.`
          )
        } else if (result.change === 'downgraded') {
          const deactivated = result.deactivatedVehicles
          toast.success(
            deactivated > 0
              ? `Moved to ${result.plan.name}. ${deactivated} listing(s) above the new cap were deactivated.`
              : `Moved to ${result.plan.name}.`
          )
        } else if (result.change === 'unchanged') {
          toast.info(`Already on ${result.plan.name}.`)
        } else {
          toast.success(`Plan changed to ${result.plan.name}.`)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to change plan')
      } finally {
        setPlanActionBusy(false)
      }
    },
    [currentPlan?.priceQar, subscription?.planId]
  )

  const handleCancelSubscription = useCallback(async () => {
    if (
      !window.confirm(
        'Cancel your dealer platform subscription?\n\nCancellation is scheduled at a billing boundary, not immediately — you keep your current tier until then.'
      )
    ) {
      return
    }
    setPlanActionBusy(true)
    try {
      const result = await cancelDealerSubscription()
      setBilling((prev) => ({
        subscription: result.subscription,
        plan: result.plan,
        quota: prev?.quota ?? {
          planId: result.plan.id,
          planCode: result.plan.code,
          planName: result.plan.name,
          limit: result.plan.vehicleLimit,
          used: 0,
          remaining: result.plan.vehicleLimit,
          overLimit: false,
          enforced: result.plan.vehicleLimit !== null,
        },
      }))
      toast.success(`Cancellation scheduled for ${formatBillingDate(result.effectiveDate)}.`)
      setShowManageBillingModal(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to cancel subscription')
    } finally {
      setPlanActionBusy(false)
    }
  }, [])

  const visibleInvoices = showAllInvoices ? invoices : invoices.slice(0, 4)

  return (
    <div className="subscription-billing-page">
      <Sidebar />
      <Header />

      <div className="subscription-billing-content" role="main">
        <div className="page-header">
          <h1 className="page-title">Subscription & Billing</h1>
          <p className="page-subtitle">Manage your dealer platform plan, invoices, and payment methods</p>
        </div>

        {loading && (
          <div className="subscription-loading" role="status">
            <div className="subscription-loading-spinner" />
            <span>Loading subscription...</span>
          </div>
        )}
        {loadError && !loading && (
          <div className="subscription-error-banner" role="alert">
            {loadError}
          </div>
        )}

        {!loading && !loadError && openInvoices.length > 0 && (
          <div className="subscription-due-banner" role="alert">
            <AlertTriangle size={16} />
            <div>
              <strong>
                {formatCurrency(openInvoiceTotal)} outstanding across {openInvoices.length} invoice
                {openInvoices.length === 1 ? '' : 's'}.
              </strong>
              <div className="subscription-due-banner-sub">
                Earliest due {formatBillingDate(openInvoices[0]?.dueDate)}. Unpaid dealer invoices move
                your subscription to past due and then back to the free tier. Dealer subscription
                invoices are settled by CarFlow billing — self-service card payment for them is not
                available yet.
              </div>
            </div>
          </div>
        )}

        {/* Current Plan Section */}
        <div className="current-plan-section">
          <div className="current-plan-card">
            <div className="plan-header-info">
              <div className="plan-icon">
                <CreditCard size={28} />
              </div>
              <div className="plan-title-info">
                <h3 className="plan-name">
                  {currentPlan ? `${currentPlan.name} Plan` : 'No dealer plan'}
                </h3>
                <p className="plan-subtitle">Your CarFlow dealer platform subscription</p>
              </div>
              <div className="plan-price-info">
                <div className="plan-price">
                  {currentPlan ? formatCurrency(currentPlan.priceQar) : '—'}
                </div>
                <div className="plan-period">per month</div>
              </div>
            </div>

            <div className="plan-details-grid">
              <div className="plan-features-section">
                <h4 className="section-title">Plan Features</h4>
                {currentPlan?.features.length ? (
                  <ul className="features-list">
                    {currentPlan.features.map((feature) => (
                      <li key={feature}>
                        <Check size={14} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="modal-section-hint">
                    {currentPlan
                      ? 'No features listed for this plan.'
                      : 'Choose a plan below to start a dealer subscription.'}
                  </p>
                )}
              </div>

              <div className="billing-info-section">
                <h4 className="section-title">Billing Information</h4>
                <div className="billing-info-item">
                  <span className="info-label">Status</span>
                  <span
                    className={`status-badge subscription-status subscription-status--${subscription?.status ?? 'unknown'}`}
                  >
                    {formatSubscriptionStatus(subscription?.status)}
                  </span>
                </div>
                <div className="billing-info-item">
                  <span className="info-label">Current period ends</span>
                  <span className="info-value">{formatBillingDate(subscription?.currentPeriodEnd)}</span>
                </div>
                <div className="billing-info-item">
                  <span className="info-label">
                    {subscription?.cancelAt ? 'Cancels on' : 'Renews'}
                  </span>
                  <span className="info-value">
                    {subscription?.cancelAt
                      ? formatBillingDate(subscription.cancelAt)
                      : subscription
                        ? 'Automatically each period'
                        : '—'}
                  </span>
                </div>
              </div>
            </div>

            <div className="plan-actions">
              <button
                className="action-btn"
                type="button"
                onClick={() => handleDownloadInvoices(invoices)}
              >
                <Download size={14} />
                Export invoices
              </button>
              <button className="action-btn" type="button" onClick={handleManageBilling}>
                <Settings size={14} />
                Manage Billing
              </button>
              <button className="action-btn primary" type="button" onClick={handleUpgradePlan}>
                <Star size={14} />
                Change Plan
              </button>
            </div>
          </div>

          <div className="usage-overview-card">
            <div className="card-header">
              <div className="card-title-section">
                <Gauge size={18} />
                <h3 className="card-title">Plan usage</h3>
              </div>
              <p className="card-description">Listing headroom reported by your plan</p>
            </div>
            <div className="usage-list">
              {quotaView ? (
                <div className={`usage-item usage-item--${quotaView.tone}`}>
                  <div className="usage-header">
                    <span className="usage-label">{quotaView.label}</span>
                    <span className="usage-count">{quotaView.countLabel}</span>
                  </div>
                  <div className="usage-progress-bar">
                    <div
                      className="usage-progress-fill"
                      style={{ width: `${quotaView.percentage}%` }}
                    ></div>
                  </div>
                  <div className="usage-available">{quotaView.note}</div>
                </div>
              ) : (
                <div className="usage-available">Usage becomes available once your plan loads.</div>
              )}
            </div>
          </div>
        </div>

        {/* Plan Selection Section */}
        <div className="plan-selection-section" ref={planSectionRef}>
          <div className="section-header">
            <h2 className="section-title">Choose Your Plan</h2>
            <p className="section-subtitle">
              Upgrades apply immediately and are invoiced straight away; downgrades apply immediately with
              no refund and deactivate listings above the new cap.
            </p>
          </div>

          {availablePlans.length === 0 && !loading ? (
            <p className="modal-section-hint">No dealer plans are on sale right now.</p>
          ) : (
            <div className="plans-grid">
              {availablePlans.map((plan) => {
                const isCurrent = subscription?.planId === plan.id
                return (
                  <div key={plan.id} className={`plan-card ${isCurrent ? 'current' : ''}`}>
                    <div className="plan-card-header">
                      <h3 className="plan-card-name">{plan.name}</h3>
                      <p className="plan-card-description">
                        {plan.vehicleLimit === null
                          ? 'Unlimited vehicle listings'
                          : `Up to ${plan.vehicleLimit} vehicle listing${plan.vehicleLimit === 1 ? '' : 's'}`}
                      </p>
                      <div className="plan-card-price">
                        <div className="price-amount">{formatCurrency(plan.priceQar)}</div>
                        <div className="price-period">per month</div>
                      </div>
                    </div>
                    <div className="plan-card-content">
                      {plan.features.length ? (
                        <ul className="plan-features-list">
                          {plan.features.map((feature) => (
                            <li key={feature}>
                              <Check size={14} />
                              {feature}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <button
                        className={`choose-plan-btn ${isCurrent ? 'current' : ''}`}
                        type="button"
                        disabled={planActionBusy || isCurrent}
                        onClick={() => void handleChoosePlan(plan)}
                      >
                        {isCurrent ? 'Current Plan' : planActionBusy ? 'Updating…' : 'Choose Plan'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Payment Methods and Billing History Section */}
        <div className="billing-details-section">
          <div className="payment-methods-card">
            <div className="card-header">
              <div className="card-title-section">
                <CreditCard size={18} />
                <h3 className="card-title">Payment Methods</h3>
              </div>
              <p className="card-description">Manage your payment methods</p>
              <button className="add-card-btn" type="button" onClick={handleManageBilling}>
                <Plus size={14} />
                Add Card
              </button>
            </div>
            {paymentActionError && (
              <div className="subscription-inline-error" role="alert">
                {paymentActionError}
              </div>
            )}
            <div className="payment-methods-list">
              {paymentMethods.length === 0 && !loading ? (
                <p className="modal-section-hint">No payment methods saved.</p>
              ) : null}
              {paymentMethods.map((method) => (
                <div key={method.id} className="payment-method-item">
                  <div className="payment-method-info">
                    <div className="card-type-badge">
                      {method.type === 'visa' ? 'visa' : 'mastercard'}
                    </div>
                    <div className="card-details">
                      <div className="card-number">**** **** **** {method.last4}</div>
                      <div className="card-expiry">Expires {method.expiry}</div>
                    </div>
                  </div>
                  <div className="payment-method-actions">
                    {method.isDefault && <span className="default-badge">Default</span>}
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Remove payment method"
                      onClick={() => handleRemovePaymentMethod(method.id)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="billing-history-card">
            <div className="card-header">
              <div className="card-title-section">
                <Receipt size={18} />
                <h3 className="card-title">Invoice history</h3>
              </div>
              <p className="card-description">Dealer subscription invoices raised by CarFlow</p>
            </div>
            <div className="billing-history-list">
              {invoices.length === 0 && !loading ? (
                <p className="modal-section-hint">
                  No invoices yet — your dealer subscription has not been billed.
                </p>
              ) : null}
              {visibleInvoices.map((invoice) => (
                <div key={invoice.id} className="billing-history-item">
                  <div className="billing-info">
                    <div className="billing-description">{invoice.description}</div>
                    <div className="billing-date">
                      {formatBillingDate(invoice.date)}
                      {INVOICE_OPEN_STATUSES.has(invoice.status)
                        ? ` · due ${formatBillingDate(invoice.dueDate)}`
                        : invoice.paidAt
                          ? ` · paid ${formatDate(new Date(invoice.paidAt))}`
                          : ''}
                    </div>
                  </div>
                  <div className="billing-actions">
                    <div className="billing-amount-status">
                      <div className="billing-amount">{formatCurrency(invoice.amount)}</div>
                      <span className={`status-badge ${invoice.status}`}>
                        {invoice.status.replace('_', ' ')}
                      </span>
                    </div>
                    <button
                      className="icon-btn"
                      type="button"
                      aria-label="Export invoice"
                      onClick={() => handleDownloadInvoices([invoice])}
                    >
                      <Download size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {invoices.length > 4 ? (
                <button
                  className="view-all-btn"
                  type="button"
                  onClick={() => setShowAllInvoices((prev) => !prev)}
                >
                  {showAllInvoices ? 'Show Recent Invoices' : `View All ${invoices.length} Invoices`}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Manage Billing Modal */}
      {showManageBillingModal && (
        <div className="modal-overlay" onClick={handleCloseManageBilling}>
          <div className="modal-content manage-billing-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" type="button" onClick={handleCloseManageBilling}>
              <X size={14} />
            </button>
            <div className="modal-header">
              <h2 className="modal-title">Manage Billing</h2>
              <p className="modal-subtitle">Billing details and subscription controls</p>
            </div>
            <div className="modal-body">
              <div className="modal-section">
                <h3 className="modal-section-title">Default Payment Method</h3>
                <div className="payment-methods-list-modal">
                  {paymentMethods.length === 0 ? (
                    <p className="modal-section-hint">No payment methods saved.</p>
                  ) : null}
                  {paymentMethods.map((method) => (
                    <div key={method.id} className="payment-method-item-modal">
                      <div className="payment-method-info">
                        <div className="card-type-badge">{method.type === 'visa' ? 'visa' : 'mastercard'}</div>
                        <div className="card-details">
                          <div className="card-number">**** **** **** {method.last4}</div>
                          <div className="card-expiry">Expires {method.expiry}</div>
                        </div>
                      </div>
                      <div className="payment-method-actions">
                        {method.isDefault && <span className="default-badge">Default</span>}
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="Remove payment method"
                          onClick={() => handleRemovePaymentMethod(method.id)}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="modal-section">
                <h3 className="modal-section-title">Billing Address</h3>
                <p className="modal-section-hint">Saved on this device only (local storage).</p>
                <div className="address-form-grid">
                  <div className="form-group">
                    <label>Company Name</label>
                    <input
                      type="text"
                      placeholder="Your Company Name"
                      value={billingAddress.companyName}
                      onChange={(e) =>
                        setBillingAddress((prev) => ({ ...prev, companyName: e.target.value }))
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>Address Line 1</label>
                    <input
                      type="text"
                      placeholder="123 Business District"
                      value={billingAddress.addressLine1}
                      onChange={(e) =>
                        setBillingAddress((prev) => ({ ...prev, addressLine1: e.target.value }))
                      }
                    />
                  </div>
                  <div className="form-group">
                    <label>City</label>
                    <input
                      type="text"
                      placeholder="Doha"
                      value={billingAddress.city}
                      onChange={(e) => setBillingAddress((prev) => ({ ...prev, city: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>State/Region</label>
                    <input
                      type="text"
                      placeholder="Doha"
                      value={billingAddress.state}
                      onChange={(e) => setBillingAddress((prev) => ({ ...prev, state: e.target.value }))}
                    />
                  </div>
                  <div className="form-group">
                    <label>Postal Code</label>
                    <input
                      type="text"
                      placeholder="12345"
                      value={billingAddress.postalCode}
                      onChange={(e) =>
                        setBillingAddress((prev) => ({ ...prev, postalCode: e.target.value }))
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <h3 className="modal-section-title">Plan Management</h3>
                <div className="plan-management-cards">
                  <div className="plan-management-card">
                    <div className="plan-management-info">
                      <div className="plan-management-title">Change Plan</div>
                      <div className="plan-management-description">Upgrade or downgrade your current plan</div>
                    </div>
                    <button
                      className="plan-management-btn"
                      type="button"
                      onClick={() => {
                        setShowManageBillingModal(false)
                        planSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
                      }}
                    >
                      Change Plan
                    </button>
                  </div>
                  <div className="plan-management-card">
                    <div className="plan-management-info">
                      <div className="plan-management-title">Dealer platform plan</div>
                      <div className="plan-management-description">
                        This manages your CarFlow dealer SaaS subscription (listings tier), not your
                        customers&apos; monthly car subscriptions. Customer subscriptions are managed
                        under Rentals and Booking Requests.
                      </div>
                    </div>
                    <button
                      className="plan-management-btn cancel"
                      type="button"
                      disabled={planActionBusy || !subscription || subscription.status === 'cancelled'}
                      onClick={() => void handleCancelSubscription()}
                    >
                      Cancel subscription
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="modal-btn cancel" type="button" onClick={handleCloseManageBilling}>
                Close
              </button>
              <button
                className="modal-btn primary"
                type="button"
                onClick={() => {
                  try {
                    localStorage.setItem(BILLING_STORAGE_KEY, JSON.stringify(billingAddress))
                  } catch {
                    /* ignore quota / private mode */
                  }
                  setShowManageBillingModal(false)
                }}
              >
                <Check size={14} />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
