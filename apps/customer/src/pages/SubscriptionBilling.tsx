import { useState, useCallback, memo, useEffect, useMemo } from 'react'
import type { Invoice, PaymentMethod } from '@carflow/shared'
import { supabase } from '@carflow/shared'
import {
  listInvoices,
  listPaymentMethods,
  listRentalsWithDetails,
  removePaymentMethod,
  setDefaultPaymentMethod,
} from '../services/customerService'
import { toast } from '../hooks/useToast'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { Sidebar } from '../components/shared/Sidebar'
import { CreditCard } from 'lucide-react'
import { InfoModal } from '../components/shared/InfoModal'
import './SubscriptionBilling.css'

export const SubscriptionBilling = memo(function SubscriptionBilling() {
  const [activeTab, setActiveTab] = useState<'overview' | 'billing' | 'payment'>('overview')
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [activeRentalsCount, setActiveRentalsCount] = useState(0)
  const [memberSince, setMemberSince] = useState<string>('—')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setLoadError(null)
        const [inv, pm, rentalsRes, authRes] = await Promise.all([
          listInvoices(),
          listPaymentMethods(),
          listRentalsWithDetails({ pageSize: 200 }),
          supabase.auth.getUser(),
        ])
        if (cancelled) return
        setInvoices(inv)
        setPaymentMethods(pm)
        const active = rentalsRes.items.filter(
          (r) => r.status === 'active' || r.status === 'reserved'
        ).length
        setActiveRentalsCount(active)
        const created = authRes.data.user?.created_at
        setMemberSince(
          created
            ? new Date(created).toLocaleDateString(undefined, { dateStyle: 'medium' })
            : '—'
        )
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

  const handleDownloadInvoice = useCallback((invoice: Invoice) => {
    const rows = [
      ['Invoice ID', invoice.id],
      ['Date', invoice.date],
      ['Description', invoice.description],
      ['Amount', `QAR ${invoice.amount.toLocaleString('en-US')}`],
      ['Status', invoice.status],
    ]
    const csv = rows.map((row) => `"${row[0]}","${row[1]}"`).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', `invoice-${invoice.id}.csv`)
    document.body.appendChild(link)
    link.click()
    link.remove()
  }, [])

  const handleViewInvoice = useCallback((invoice: Invoice) => {
    setInfoModal({
      title: `Invoice ${invoice.id}`,
      message: `${invoice.description} — QAR ${invoice.amount.toLocaleString('en-US')} (${invoice.status})`,
    })
  }, [])

  return (
    <div className="subscription-billing-page">
      <Header />

      <div className="subscription-billing-container">
        <Sidebar />

        <div className="main-content">
          <div className="page-header">
            <h1 className="page-title">Billing</h1>
            <p className="page-subtitle">
              View rental charges, invoices, and saved payment methods.
            </p>
          </div>

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
                Billing
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
                      <div className="billing-stat-value">QAR {totalSpent.toLocaleString('en-US')}</div>
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
                      <button
                        type="button"
                        className="billing-link-btn"
                        onClick={() => handleTabChange('payment')}
                      >
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
                                <td>QAR {invoice.amount.toLocaleString('en-US')}</td>
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
                                      title="Download"
                                      onClick={() => handleDownloadInvoice(invoice)}
                                    >
                                      ⬇
                                    </button>
                                    <button
                                      type="button"
                                      className="action-icon"
                                      title="View"
                                      onClick={() => handleViewInvoice(invoice)}
                                    >
                                      👁
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
                    <h3 className="billing-section-title">Payment methods</h3>
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
                                  .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to update'))
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
                                  .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to remove'))
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                    <p className="billing-empty-hint" style={{ marginTop: '1rem' }}>
                      To add a payment method, please visit the dealership.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <InfoModal
        open={!!infoModal}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onClose={() => setInfoModal(null)}
      />

      <Footer />
    </div>
  )
})
