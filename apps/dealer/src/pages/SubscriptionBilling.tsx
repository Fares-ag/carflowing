import { useState, useCallback, useMemo, memo, useEffect, useRef } from 'react'
import {
  getDealerVehicleCount,
  getSubscription,
  listBillingHistory,
  listPaymentMethods,
  removePaymentMethod,
} from '../services/dealerService'
import type { Subscription } from '@carflow/shared'
import { Sidebar } from '../components/Sidebar'
import { Header } from '../components/Header'
import {
  Bell,
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
import './SubscriptionBilling.css'

interface PaymentMethod {
  id: string
  type: 'visa' | 'mastercard'
  last4: string
  expiry: string
  isDefault: boolean
}

interface BillingHistoryItem {
  id: string
  description: string
  date: string
  amount: string
  status: 'paid' | 'pending'
}

// Extracted constants
const CURRENT_PLAN_FEATURES = [
  'Up to 25 vehicles',
  'Advanced analytics',
  'Priority support',
  'Custom branding',
  'API access',
] as const

type UsageBarRow = {
  label: string
  used: number
  total: number
  percentage: number
  /** When set, show `used / totalDisplay` instead of numeric total (e.g. unlimited plan). */
  totalDisplay?: string
}

const DEFAULT_USAGE_CAPS: { vehicles: number; rentals: number; leads: number; messages: number } = {
  vehicles: 25,
  rentals: 200,
  leads: 500,
  messages: 5000,
}

const USAGE_FALLBACK: UsageBarRow[] = [
  { label: 'Vehicles', used: 0, total: DEFAULT_USAGE_CAPS.vehicles, percentage: 0 },
  { label: 'Active Rentals', used: 0, total: DEFAULT_USAGE_CAPS.rentals, percentage: 0 },
  { label: 'Leads', used: 0, total: DEFAULT_USAGE_CAPS.leads, percentage: 0 },
  { label: 'Messages', used: 0, total: DEFAULT_USAGE_CAPS.messages, percentage: 0 },
]

const BILLING_STORAGE_KEY = 'carflow-dealer-billing'

type BillingAddressForm = {
  companyName: string
  taxId: string
  addressLine1: string
  city: string
  state: string
  postalCode: string
}

const EMPTY_BILLING: BillingAddressForm = {
  companyName: '',
  taxId: '',
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

function parseVehicleCapFromFeatures(features: string[] | undefined): number | 'unlimited' | null {
  if (!features?.length) return null
  for (const f of features) {
    if (/unlimited/i.test(f) && /vehicle/i.test(f)) return 'unlimited'
    const m = f.match(/(?:up to\s+)?(\d+)\s+vehicles?/i)
    if (m) return parseInt(m[1], 10)
  }
  return null
}

function formatBillingDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function computeNextBillingDate(sub: Subscription | null): string {
  if (!sub) return '—'
  const periodEnd = (sub as Subscription & { currentPeriodEnd?: string }).currentPeriodEnd
  if (periodEnd) {
    const d = new Date(periodEnd)
    if (Number.isFinite(d.getTime())) return formatBillingDate(d)
  }
  if (sub.endDate) {
    const d = new Date(sub.endDate + 'T12:00:00')
    if (Number.isFinite(d.getTime())) return formatBillingDate(d)
  }
  const start = new Date(sub.startDate + 'T12:00:00')
  if (!Number.isFinite(start.getTime())) return '—'
  start.setDate(start.getDate() + 30)
  return formatBillingDate(start)
}

function formatSubscriptionStatus(status: Subscription['status'] | undefined): string {
  if (!status) return 'Unknown'
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

const MONTHLY_PLANS = [
  {
    name: 'Starter',
    price: 'QAR 99',
    period: 'per month',
    description: 'Perfect for small dealerships',
    features: [
      'Up to 10 vehicles',
      'Basic analytics',
      'Email support',
      'Standard branding',
      'Basic mobile app',
    ],
  },
  {
    name: 'Professional',
    price: 'QAR 299',
    period: 'per month',
    description: 'Best for growing businesses',
    isPopular: true,
    features: [
      'Up to 25 vehicles',
      'Advanced analytics',
      'Priority support',
      'Custom branding',
      'API access',
      'Advanced reporting',
      'Lead management',
    ],
  },
  {
    name: 'Enterprise',
    price: 'QAR 599',
    period: 'per month',
    description: 'For large-scale operations',
    features: [
      'Unlimited vehicles',
      'Custom analytics',
      '24/7 phone support',
      'White-label solution',
      'Full API access',
      'Custom integrations',
      'Dedicated account manager',
      'Advanced automation',
    ],
  },
] as const

const YEARLY_PLANS = [
  {
    name: 'Starter',
    price: 'QAR 990',
    period: 'per year',
    savings: 'Save QAR 198 annually',
    description: 'Perfect for small dealerships',
    features: [
      'Up to 10 vehicles',
      'Basic analytics',
      'Email support',
      'Standard branding',
      'Basic mobile app',
    ],
  },
  {
    name: 'Professional',
    price: 'QAR 2,990',
    period: 'per year',
    savings: 'Save QAR 598 annually',
    description: 'Best for growing businesses',
    isPopular: true,
    features: [
      'Up to 25 vehicles',
      'Advanced analytics',
      'Priority support',
      'Custom branding',
      'API access',
      'Advanced reporting',
      'Lead management',
    ],
  },
  {
    name: 'Enterprise',
    price: 'QAR 5,990',
    period: 'per year',
    savings: 'Save QAR 1,198 annually',
    description: 'For large-scale operations',
    features: [
      'Unlimited vehicles',
      'Custom analytics',
      '24/7 phone support',
      'White-label solution',
      'Full API access',
      'Custom integrations',
      'Dedicated account manager',
      'Advanced automation',
    ],
  },
] as const

export const SubscriptionBilling = memo(function SubscriptionBilling() {
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [showManageBillingModal, setShowManageBillingModal] = useState(false)
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [billingHistory, setBillingHistory] = useState<BillingHistoryItem[]>([])
  const [subscriptionRecord, setSubscriptionRecord] = useState<Subscription | null>(null)
  const [vehicleCountState, setVehicleCountState] = useState(0)
  const [showAllInvoices, setShowAllInvoices] = useState(false)
  const [selectedPlanName, setSelectedPlanName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [paymentActionError, setPaymentActionError] = useState<string | null>(null)
  const [billingAddress, setBillingAddress] = useState<BillingAddressForm>(() => loadBillingAddress())
  const planSectionRef = useRef<HTMLDivElement>(null)

  const { subscriptionUsage, usageLimitNote } = useMemo(() => {
    const pct = (used: number, total: number) =>
      total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0

    if (!subscriptionRecord) {
      return {
        subscriptionUsage: USAGE_FALLBACK.map((r) => ({ ...r, percentage: 0 })),
        usageLimitNote: 'Default limits.',
      }
    }

    const vehicleCap = parseVehicleCapFromFeatures(subscriptionRecord.plan?.features)
    const listings = subscriptionRecord.usage.listings ?? 0
    const rentals = subscriptionRecord.usage.rentals ?? 0
    const messages = subscriptionRecord.usage.messages ?? 0

    let vTotal: number = DEFAULT_USAGE_CAPS.vehicles
    let vDisplay: string | undefined
    if (vehicleCap === 'unlimited') {
      vTotal = Math.max(vehicleCountState, 1)
      vDisplay = '∞'
    } else if (typeof vehicleCap === 'number') {
      vTotal = vehicleCap
    }

    const vPct =
      vehicleCap === 'unlimited'
        ? vehicleCountState > 0
          ? 100
          : 0
        : pct(vehicleCountState, vTotal)

    const limitNote =
      vehicleCap != null
        ? 'Vehicle cap from your plan. Rentals, leads, and messages use default limits until configured.'
        : 'Default limits.'

    return {
      subscriptionUsage: [
        {
          label: 'Vehicles',
          used: vehicleCountState,
          total: vTotal,
          percentage: vPct,
          totalDisplay: vDisplay,
        },
        {
          label: 'Active Rentals',
          used: rentals,
          total: DEFAULT_USAGE_CAPS.rentals,
          percentage: pct(rentals, DEFAULT_USAGE_CAPS.rentals),
        },
        {
          label: 'Leads',
          used: listings,
          total: DEFAULT_USAGE_CAPS.leads,
          percentage: pct(listings, DEFAULT_USAGE_CAPS.leads),
        },
        {
          label: 'Messages',
          used: messages,
          total: DEFAULT_USAGE_CAPS.messages,
          percentage: pct(messages, DEFAULT_USAGE_CAPS.messages),
        },
      ],
      usageLimitNote: limitNote,
    }
  }, [subscriptionRecord, vehicleCountState])

  useEffect(() => {
    setLoading(true)
    setLoadError(null)
    Promise.all([
      getSubscription(),
      listPaymentMethods(),
      listBillingHistory(),
      getDealerVehicleCount(),
    ])
      .then(([subscription, methods, history, vehicleCount]) => {
        setSubscriptionRecord(subscription)
        setVehicleCountState(vehicleCount)
        setPaymentMethods(
          methods.map(method => ({
            id: method.id,
            type: method.brand.toLowerCase() === 'mastercard' ? 'mastercard' : 'visa',
            last4: method.last4,
            expiry: `${String(method.expiryMonth).padStart(2, '0')}/${String(method.expiryYear).slice(-2)}`,
            isDefault: method.isDefault,
          }))
        )
        setBillingHistory(
          history.map(item => ({
            id: item.id,
            description: item.description,
            date: item.date,
            amount: `QAR ${item.amount.toLocaleString('en-US')}`,
            status: item.status === 'paid' ? 'paid' : 'pending',
          }))
        )
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load subscription data')
      })
      .finally(() => setLoading(false))
  }, [])

  const handleRemovePaymentMethod = useCallback(async (id: string) => {
    setPaymentActionError(null)
    try {
      await removePaymentMethod(id)
      setPaymentMethods((prev) => prev.filter((item) => item.id !== id))
    } catch (err) {
      setPaymentActionError(err instanceof Error ? err.message : 'Could not remove payment method')
    }
  }, [])

  const handleBillingPeriodChange = useCallback((period: 'monthly' | 'yearly') => {
    setBillingPeriod(period)
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

  const handleDownloadInvoice = useCallback((items: BillingHistoryItem[]) => {
    const rows = (items.length ? items : billingHistory).map(item => ({
      id: item.id,
      description: item.description,
      date: item.date,
      amount: item.amount,
      status: item.status,
    }))
    if (!rows.length) return
    const headers = Object.keys(rows[0] ?? {})
    const csv = [
      headers.join(','),
      ...rows.map((row) =>
        headers.map((header) => `"${String((row as Record<string, string>)[header] ?? '')}"`).join(',')
      ),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', 'billing-invoices.csv')
    document.body.appendChild(link)
    link.click()
    link.remove()
  }, [billingHistory])

  const handleUpgradePlan = useCallback(() => {
    planSectionRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const handleChoosePlan = useCallback((planName: string) => {
    setSelectedPlanName(planName)
    setShowManageBillingModal(true)
  }, [])

  const plans = useMemo(() => billingPeriod === 'monthly' ? MONTHLY_PLANS : YEARLY_PLANS, [billingPeriod])

  const getAvailablePercentage = useCallback((used: number, total: number) => {
    if (total <= 0) return 0
    return ((total - used) / total) * 100
  }, [])

  const visibleBillingHistory = showAllInvoices ? billingHistory : billingHistory.slice(0, 4)

  return (
    <div className="subscription-billing-page">
      <Sidebar />
      <Header />

      <div className="subscription-billing-content">
        <div className="page-header">
          <h1 className="page-title">Subscription & Billing</h1>
          <p className="page-subtitle">Manage your subscription, billing, and payment methods</p>
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

        {/* Current Plan Section */}
        <div className="current-plan-section">
          <div className="current-plan-card">
            <div className="plan-header-info">
              <div className="plan-icon">
                <CreditCard size={28} />
              </div>
              <div className="plan-title-info">
                <h3 className="plan-name">
                  {subscriptionRecord?.plan?.name
                    ? `${subscriptionRecord.plan.name} Plan`
                    : 'Professional Plan'}
                </h3>
                <p className="plan-subtitle">Your current subscription</p>
              </div>
              <div className="plan-price-info">
                <div className="plan-price">
                  QAR{' '}
                  {(subscriptionRecord?.plan?.priceMonthly ?? 299).toLocaleString('en-US')}
                </div>
                <div className="plan-period">per month</div>
              </div>
            </div>

            <div className="plan-details-grid">
              <div className="plan-features-section">
                <h4 className="section-title">Plan Features</h4>
                <ul className="features-list">
                  {(subscriptionRecord?.plan?.features?.length
                    ? subscriptionRecord.plan.features
                    : [...CURRENT_PLAN_FEATURES]
                  ).map((feature, index) => (
                    <li key={index}>
                      <Check size={14} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="billing-info-section">
                <h4 className="section-title">Billing Information</h4>
                <div className="billing-info-item">
                  <span className="info-label">Status</span>
                  <span
                    className={`status-badge subscription-status subscription-status--${subscriptionRecord?.status ?? 'unknown'}`}
                  >
                    {formatSubscriptionStatus(subscriptionRecord?.status)}
                  </span>
                </div>
                <div className="billing-info-item">
                  <span className="info-label">Next billing</span>
                  <span className="info-value">{computeNextBillingDate(subscriptionRecord)}</span>
                </div>
                <div className="billing-info-item">
                  <span className="info-label">Auto-renewal</span>
                  <span className="info-value">
                    {subscriptionRecord?.status === 'active'
                      ? 'Auto-renewal Enabled'
                      : 'Auto-renewal Disabled'}
                  </span>
                </div>
              </div>
            </div>

            <div className="plan-actions">
              <button
                className="action-btn"
                onClick={() => handleDownloadInvoice(billingHistory.slice(0, 1))}
              >
                <Download size={14} />
                Download Invoice
              </button>
              <button className="action-btn" onClick={handleManageBilling}>
                <Settings size={14} />
                Manage Billing
              </button>
              <button className="action-btn primary" onClick={handleUpgradePlan}>
                <Star size={14} />
                Upgrade Plan
              </button>
            </div>
          </div>

          <div className="usage-overview-card">
            <div className="card-header">
              <div className="card-title-section">
              <Gauge size={18} />
                <h3 className="card-title">Usage Overview</h3>
              </div>
              <p className="card-description">Current month usage · {usageLimitNote}</p>
            </div>
            <div className="usage-list">
              {subscriptionUsage.map((item, index) => {
                const availablePercent = getAvailablePercentage(item.used, item.total)
                const countLabel =
                  item.totalDisplay != null ? `${item.used} / ${item.totalDisplay}` : `${item.used} / ${item.total}`
                return (
                  <div key={index} className="usage-item">
                    <div className="usage-header">
                      <span className="usage-label">{item.label}</span>
                      <span className="usage-count">{countLabel}</span>
                    </div>
                    <div className="usage-progress-bar">
                      <div 
                        className="usage-progress-fill" 
                        style={{ width: `${item.percentage}%` }}
                      ></div>
                    </div>
                    <div className="usage-available">
                      {item.totalDisplay === '∞'
                        ? 'Unlimited plan'
                        : `${Math.round(availablePercent)}% available`}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Plan Selection Section */}
        <div className="plan-selection-section" ref={planSectionRef}>
          <div className="section-header">
            <h2 className="section-title">Choose Your Plan</h2>
            <p className="section-subtitle">Upgrade or downgrade your subscription at any time</p>
          </div>

          <div className="billing-period-tabs">
            <button
              className={`tab ${billingPeriod === 'monthly' ? 'active' : ''}`}
              onClick={() => handleBillingPeriodChange('monthly')}
            >
              Monthly
            </button>
            <button
              className={`tab ${billingPeriod === 'yearly' ? 'active' : ''}`}
              onClick={() => handleBillingPeriodChange('yearly')}
            >
              Yearly (Save 17%)
            </button>
          </div>

          <div className="plans-grid">
            {plans.map((plan) => {
              const isCurrent = subscriptionRecord?.plan?.name === plan.name
              return (
              <div
                key={plan.name}
                className={`plan-card ${isCurrent ? 'current' : ''} ${'isPopular' in plan && plan.isPopular ? 'popular' : ''}`}
              >
                {'isPopular' in plan && plan.isPopular ? (
                  <div className="popular-badge">Most Popular</div>
                ) : null}
                <div className="plan-card-header">
                  <h3 className="plan-card-name">{plan.name}</h3>
                  <p className="plan-card-description">{plan.description}</p>
                  <div className="plan-card-price">
                    <div className="price-amount">{plan.price}</div>
                    <div className="price-period">{plan.period}</div>
                    {'savings' in plan && plan.savings ? (
                      <div className="price-savings">{plan.savings}</div>
                    ) : null}
                  </div>
                </div>
                <div className="plan-card-content">
                  <ul className="plan-features-list">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex}>
                        <Check size={14} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button
                    className={`choose-plan-btn ${isCurrent ? 'current' : ''}`}
                    onClick={() => handleChoosePlan(plan.name)}
                  >
                    {isCurrent ? 'Current Plan' : 'Choose Plan'}
                  </button>
                </div>
              </div>
            )
            })}
          </div>
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
                <h3 className="card-title">Billing History</h3>
              </div>
              <p className="card-description">Download invoices and view payment history</p>
            </div>
            <div className="billing-history-list">
              {visibleBillingHistory.map((item) => (
                <div key={item.id} className="billing-history-item">
                  <div className="billing-info">
                    <div className="billing-description">{item.description}</div>
                    <div className="billing-date">{item.date}</div>
                  </div>
                  <div className="billing-actions">
                    <div className="billing-amount-status">
                      <div className="billing-amount">{item.amount}</div>
                      <span className={`status-badge ${item.status}`}>{item.status}</span>
                    </div>
                    <button className="icon-btn" onClick={() => handleDownloadInvoice([item])}>
                      <Download size={14} />
                    </button>
                  </div>
                </div>
              ))}
              <button className="view-all-btn" onClick={() => setShowAllInvoices((prev) => !prev)}>
                {showAllInvoices ? 'Show Recent Invoices' : 'View All Invoices'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Manage Billing Modal */}
      {showManageBillingModal && (
        <div className="modal-overlay" onClick={handleCloseManageBilling}>
          <div className="modal-content manage-billing-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={handleCloseManageBilling}>
              <X size={14} />
            </button>
            <div className="modal-header">
              <h2 className="modal-title">Manage Billing</h2>
              <p className="modal-subtitle">Update your billing preferences and manage your subscription</p>
            </div>
            <div className="modal-body">
              <div className="modal-section">
                <h3 className="modal-section-title">Subscription Controls</h3>
                <div className="controls-grid">
                  <div className="control-card">
                    <div className="control-header">
                      <label className="control-label">
                        <input type="checkbox" defaultChecked />
                        Auto-renewal
                      </label>
                      <div className="toggle-switch active"></div>
                    </div>
                    <p className="control-description">Automatically renew your subscription to avoid service interruption</p>
                  </div>
                  <div className="control-card">
                    <div className="control-header">
                      <label className="control-label">
                        <Bell size={14} />
                        Billing Alerts
                      </label>
                      <div className="toggle-switch active"></div>
                    </div>
                    <p className="control-description">Get notified 7 days before your next billing date</p>
                  </div>
                </div>
              </div>

              <div className="modal-section">
                <h3 className="modal-section-title">Default Payment Method</h3>
                <div className="payment-methods-list-modal">
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
                    <label>Tax ID</label>
                    <input
                      type="text"
                      placeholder="QA123456789"
                      value={billingAddress.taxId}
                      onChange={(e) => setBillingAddress((prev) => ({ ...prev, taxId: e.target.value }))}
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
                      <div className="plan-management-title">Cancel Subscription</div>
                      <div className="plan-management-description">Cancel your subscription at the end of the billing period</div>
                    </div>
                    <button
                      className="plan-management-btn cancel"
                      onClick={() => {
                        const confirmed = window.confirm('Cancel your subscription at the end of the billing period?')
                        if (confirmed) {
                          setShowManageBillingModal(false)
                          setSelectedPlanName('Cancelation scheduled')
                        }
                      }}
                    >
                      Cancel Plan
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button className="modal-btn cancel" onClick={handleCloseManageBilling}>Close</button>
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
                  if (selectedPlanName) {
                    setSelectedPlanName(null)
                  }
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
