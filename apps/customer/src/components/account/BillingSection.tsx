import type { Invoice, PaymentMethod } from '@carflow/shared'
import { apiRequest, formatCurrency, formatDateOrDash } from '@carflow/shared'
import { CreditCard } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from '../../hooks/useToast'
import { t } from '../../i18n'
import {
  addPaymentMethod,
  downloadInvoicePdf,
  listInvoices,
  listPaymentMethods,
  listRentalsWithDetails,
  removePaymentMethod,
  setDefaultPaymentMethod,
} from '../../services/customerService'
import { InfoModal } from '../shared/InfoModal'
import '../../pages/SubscriptionBilling.css'

export default function BillingSection() {
  const [activeTab, setActiveTab] = useState<'overview' | 'billing' | 'payment'>('overview')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [activeRentalsCount, setActiveRentalsCount] = useState(0)
  const [memberSince, setMemberSince] = useState<string>('—')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [showAddCard, setShowAddCard] = useState(false)
  const [addingCard, setAddingCard] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [newCard, setNewCard] = useState({
    brand: 'Visa',
    last4: '',
    expiryMonth: '',
    expiryYear: '',
  })

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoadError(null)
        const [inv, pm, rentalsRes, full] = await Promise.all([
          listInvoices(),
          listPaymentMethods(),
          listRentalsWithDetails({ pageSize: 200 }),
          apiRequest<{ profile: { createdAt?: string; created_at?: string } | null }>(
            '/customer/profile/full'
          ),
        ])
        if (cancelled) return
        setInvoices(inv)
        setPaymentMethods(pm)
        const active = rentalsRes.items.filter(
          (r) => r.status === 'active' || r.status === 'reserved'
        ).length
        setActiveRentalsCount(active)
        const created = full.profile?.createdAt || (full.profile as { created_at?: string })?.created_at
        setMemberSince(formatDateOrDash(created))
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load billing data')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const totalSpent = useMemo(
    () => invoices.filter((i) => i.status === 'paid').reduce((sum, i) => sum + i.amount, 0),
    [invoices]
  )

  const handleTabChange = useCallback((tab: typeof activeTab) => {
    setActiveTab(tab)
  }, [])

  const handleDownloadInvoice = useCallback(async (invoice: Invoice) => {
    setDownloadingId(invoice.id)
    try {
      const blob = await downloadInvoicePdf(invoice.id)
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.setAttribute('download', `invoice-${invoice.id.slice(0, 8)}.pdf`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(link.href)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('billing.pdfError'))
    } finally {
      setDownloadingId(null)
    }
  }, [])

  const handleAddCard = async () => {
    if (!/^\d{4}$/.test(newCard.last4)) {
      toast.error('Enter the last 4 digits of your card.')
      return
    }
    const em = Number(newCard.expiryMonth)
    const ey = Number(newCard.expiryYear)
    if (!em || em < 1 || em > 12 || !ey || ey < new Date().getFullYear()) {
      toast.error('Enter a valid expiry date.')
      return
    }
    setAddingCard(true)
    try {
      const method = await addPaymentMethod({
        brand: newCard.brand,
        last4: newCard.last4,
        expiryMonth: em,
        expiryYear: ey,
        methodType: 'card',
      })
      setPaymentMethods((prev) => [...prev, method])
      setShowAddCard(false)
      setNewCard({ brand: 'Visa', last4: '', expiryMonth: '', expiryYear: '' })
      toast.success('Payment method added.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add payment method')
    } finally {
      setAddingCard(false)
    }
  }

  const handleViewInvoice = useCallback((invoice: Invoice) => {
    setInfoModal({
      title: `Invoice ${invoice.id}`,
      message: `${invoice.description} — ${formatCurrency(invoice.amount)} (${invoice.status})`,
    })
  }, [])

  return (
    <div className="billing-section-embedded">
      <h2 className="section-title">Billing</h2>
      <p className="settings-description" style={{ marginBottom: 16 }}>
        Rental charges, invoices, and saved payment methods.
      </p>

      <p className="billing-platform-notice">
        Subscription plans are not active yet. This shows rental billing history only.
      </p>

      {loadError && <p className="billing-load-error">{loadError}</p>}

      <div className="tabs-container">
        <div className="tabs">
          <button
            type="button"
            className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => handleTabChange('overview')}
          >
            Overview
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'billing' ? 'active' : ''}`}
            onClick={() => handleTabChange('billing')}
          >
            Invoices
          </button>
          <button
            type="button"
            className={`tab ${activeTab === 'payment' ? 'active' : ''}`}
            onClick={() => handleTabChange('payment')}
          >
            Payment
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'overview' && (
            <div className="billing-overview-root">
              <div className="billing-stat-cards">
                <div className="billing-stat-card">
                  <div className="billing-stat-label">Total spent</div>
                  <div className="billing-stat-value">{formatCurrency(totalSpent)}</div>
                  <div className="billing-stat-hint">From paid invoices</div>
                </div>
                <div className="billing-stat-card">
                  <div className="billing-stat-label">Active rentals</div>
                  <div className="billing-stat-value">{activeRentalsCount}</div>
                  <div className="billing-stat-hint">Reserved or in progress</div>
                </div>
                <div className="billing-stat-card">
                  <div className="billing-stat-label">Member since</div>
                  <div className="billing-stat-value billing-stat-value--text">{memberSince}</div>
                </div>
              </div>

              <div className="billing-overview-methods">
                <div className="billing-overview-methods-header">
                  <h3 className="billing-section-title">Payment methods</h3>
                  <button type="button" className="billing-link-btn" onClick={() => handleTabChange('payment')}>
                    Manage
                  </button>
                </div>
                {paymentMethods.length === 0 ? (
                  <p className="billing-empty-hint">No saved cards. Add one in the Payment tab.</p>
                ) : (
                  <ul className="billing-overview-method-list">
                    {paymentMethods.map((method) => (
                      <li key={method.id} className="billing-overview-method-row">
                        <CreditCard size={16} aria-hidden />
                        <span>
                          {method.brand} ···· {method.last4}
                          {method.isDefault ? ' · Default' : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="billing-tab billing-tab--simple">
              <div className="billing-history-card">
                <h3 className="billing-section-title">Invoices</h3>
                {invoices.length === 0 ? (
                  <p className="billing-empty-hint">No invoices yet.</p>
                ) : (
                  <div className="billing-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Invoice ID</th>
                          <th>Date</th>
                          <th>Description</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((invoice) => (
                          <tr key={invoice.id}>
                            <td>{invoice.id}</td>
                            <td>{invoice.date}</td>
                            <td>{invoice.description}</td>
                            <td>{formatCurrency(invoice.amount)}</td>
                            <td>
                              <span className={`status-badge ${invoice.status}`}>
                                {invoice.status === 'paid'
                                  ? 'Paid'
                                  : invoice.status === 'refunded'
                                    ? 'Refunded'
                                    : invoice.status === 'overdue'
                                      ? 'Overdue'
                                      : 'Due'}
                              </span>
                            </td>
                            <td>
                              <div className="action-buttons">
                                <button
                                  type="button"
                                  className="action-icon"
                                  title={t('billing.downloadPdf')}
                                  disabled={downloadingId === invoice.id}
                                  onClick={() => handleDownloadInvoice(invoice)}
                                >
                                  {downloadingId === invoice.id ? '…' : t('billing.downloadPdf')}
                                </button>
                                <button
                                  type="button"
                                  className="action-icon"
                                  title="View"
                                  onClick={() => handleViewInvoice(invoice)}
                                >
                                  View
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'payment' && (
            <div className="payment-tab">
              <div className="payment-methods-card">
                <div className="billing-overview-methods-header">
                  <h3 className="billing-section-title">Payment methods</h3>
                  <button
                    type="button"
                    className="billing-link-btn"
                    onClick={() => setShowAddCard((v) => !v)}
                  >
                    {showAddCard ? 'Cancel' : t('billing.addCard')}
                  </button>
                </div>

                {showAddCard && (
                  <div className="billing-add-card-form">
                    <label>
                      Brand
                      <select
                        value={newCard.brand}
                        onChange={(e) => setNewCard((c) => ({ ...c, brand: e.target.value }))}
                      >
                        <option value="Visa">Visa</option>
                        <option value="Mastercard">Mastercard</option>
                        <option value="Amex">Amex</option>
                      </select>
                    </label>
                    <label>
                      Last 4 digits
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={newCard.last4}
                        onChange={(e) =>
                          setNewCard((c) => ({ ...c, last4: e.target.value.replace(/\D/g, '').slice(0, 4) }))
                        }
                        placeholder="1234"
                      />
                    </label>
                    <label>
                      Expiry month
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={newCard.expiryMonth}
                        onChange={(e) => setNewCard((c) => ({ ...c, expiryMonth: e.target.value }))}
                        placeholder="MM"
                      />
                    </label>
                    <label>
                      Expiry year
                      <input
                        type="number"
                        min={new Date().getFullYear()}
                        value={newCard.expiryYear}
                        onChange={(e) => setNewCard((c) => ({ ...c, expiryYear: e.target.value }))}
                        placeholder="YYYY"
                      />
                    </label>
                    <button
                      type="button"
                      className="billing-link-btn"
                      disabled={addingCard}
                      onClick={handleAddCard}
                    >
                      {addingCard ? 'Saving…' : 'Save card'}
                    </button>
                  </div>
                )}

                {paymentMethods.length === 0 ? (
                  <p className="billing-empty-hint">No payment methods on file.</p>
                ) : (
                  paymentMethods.map((method) => (
                    <div key={method.id} className="payment-method-item">
                      <div className="payment-method-info">
                        <div className="payment-icon">
                          <CreditCard size={16} />
                        </div>
                        <div className="payment-details">
                          <div className="payment-type">
                            {method.brand} **** {method.last4}
                          </div>
                          <div className="payment-expiry">
                            Expires {String(method.expiryMonth).padStart(2, '0')}/
                            {String(method.expiryYear).slice(-2)}
                          </div>
                        </div>
                      </div>
                      <div className="payment-actions">
                        <button
                          type="button"
                          className="payment-action-btn"
                          disabled={method.isDefault}
                          onClick={() => {
                            if (method.isDefault) return
                            setDefaultPaymentMethod(method.id)
                              .then(() => {
                                setPaymentMethods((prev) =>
                                  prev.map((item) => ({ ...item, isDefault: item.id === method.id }))
                                )
                                toast.success('Default payment method updated.')
                              })
                              .catch((err) =>
                                toast.error(err instanceof Error ? err.message : 'Failed to update')
                              )
                          }}
                        >
                          {method.isDefault ? 'Default' : 'Set as Default'}
                        </button>
                        <button
                          type="button"
                          className="payment-action-btn remove"
                          onClick={() => {
                            if (!window.confirm('Remove this payment method?')) return
                            removePaymentMethod(method.id)
                              .then(() => {
                                setPaymentMethods((prev) => prev.filter((item) => item.id !== method.id))
                                toast.success('Payment method removed.')
                              })
                              .catch((err) =>
                                toast.error(err instanceof Error ? err.message : 'Failed to remove')
                              )
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))
                )}
                <p className="billing-empty-hint billing-payment-unavailable" style={{ marginTop: '1rem' }}>
                  Card details are stored for reference only. Pay monthly invoices from My booking via SkipCash, or
                  pay at your dealer.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <InfoModal
        open={!!infoModal}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onClose={() => setInfoModal(null)}
      />
    </div>
  )
}
