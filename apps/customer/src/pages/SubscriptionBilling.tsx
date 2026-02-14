import { useState, useCallback, memo, useEffect } from 'react'
import type { Invoice, PaymentMethod } from '@carflow/shared'
import { listInvoices, listPaymentMethods } from '../services/customerService'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { Sidebar } from '../components/shared/Sidebar'
import { CreditCard, Lightbulb } from 'lucide-react'
import { InfoModal } from '../components/shared/InfoModal'
import './SubscriptionBilling.css'

export const SubscriptionBilling = memo(function SubscriptionBilling() {
  const [activeTab, setActiveTab] = useState<'overview' | 'plan' | 'billing' | 'payment' | 'usage' | 'help'>('overview')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [newPayment, setNewPayment] = useState({ cardNumber: '', expiryMonth: '', expiryYear: '', name: '' })

  useEffect(() => {
    listInvoices().then(setInvoices)
    listPaymentMethods().then(setPaymentMethods)
  }, [])

  // Memoize tab change handler
  const handleTabChange = useCallback((tab: typeof activeTab) => {
    setActiveTab(tab)
  }, [])

  // Memoize modal handlers
  const handleOpenCancelModal = useCallback(() => {
    setShowCancelModal(true)
  }, [])

  const handleCloseCancelModal = useCallback(() => {
    setShowCancelModal(false)
  }, [])

  const handleChoosePlan = useCallback((planName: string) => {
    setInfoModal({
      title: 'Plan Selected',
      message: `Plan selected: ${planName}`,
    })
    setActiveTab('billing')
  }, [])

  const handleDownloadInvoice = useCallback((invoice: Invoice) => {
    const rows = [
      ['Invoice ID', invoice.id],
      ['Date', invoice.date],
      ['Period', invoice.description],
      ['Amount', `QAR ${invoice.amount.toLocaleString('en-US')}`],
      ['Status', invoice.status],
    ]
    const csv = rows.map(row => `"${row[0]}","${row[1]}"`).join('\n')
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
      message: `Amount: QAR ${invoice.amount.toLocaleString('en-US')}`,
    })
  }, [])

  return (
    <div className="subscription-billing-page">
      <Header />
      
      <div className="subscription-billing-container">
        <Sidebar />
        
        <div className="main-content">
          <div className="page-header">
            <h1 className="page-title">Subscription & Billing</h1>
            <p className="page-subtitle">Manage your subscription, billing, and payment methods.</p>
          </div>

          <div className="tabs-container">
            <div className="tabs">
              <button 
                className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
                onClick={() => handleTabChange('overview')}
              >
                Overview
              </button>
              <button 
                className={`tab ${activeTab === 'plan' ? 'active' : ''}`}
                onClick={() => handleTabChange('plan')}
              >
                Plan
              </button>
              <button 
                className={`tab ${activeTab === 'billing' ? 'active' : ''}`}
                onClick={() => handleTabChange('billing')}
              >
                Billing
              </button>
              <button 
                className={`tab ${activeTab === 'payment' ? 'active' : ''}`}
                onClick={() => handleTabChange('payment')}
              >
                Payment
              </button>
              <button 
                className={`tab ${activeTab === 'usage' ? 'active' : ''}`}
                onClick={() => handleTabChange('usage')}
              >
                Usage
              </button>
              <button 
                className={`tab ${activeTab === 'help' ? 'active' : ''}`}
                onClick={() => handleTabChange('help')}
              >
                Help
              </button>
            </div>

            <div className="tab-content">
              {activeTab === 'overview' && (
                <div className="overview-tab">
                  <div className="current-plan-card">
                    <div className="plan-header">
                      <h3>Current Plan</h3>
                      <div className="plan-badge premium">Premium Plan</div>
                    </div>
                    <div className="plan-details">
                      <div className="plan-price">QAR 299<span className="period">/month</span></div>
                      <div className="plan-features-grid">
                        <div className="plan-feature">
                          <span className="feature-label">Users:</span>
                          <span className="feature-value">Unlimited</span>
                        </div>
                        <div className="plan-feature">
                          <span className="feature-label">Projects:</span>
                          <span className="feature-value">Unlimited</span>
                        </div>
                        <div className="plan-feature">
                          <span className="feature-label">Storage:</span>
                          <span className="feature-value">Unlimited</span>
                        </div>
                      </div>
                      <button className="manage-plan-btn" onClick={handleOpenCancelModal}>
                        Manage Plan
                      </button>
                    </div>
                  </div>

                  <div className="plan-benefits-card">
                    <h3>Plan Benefits</h3>
                    <div className="benefits-list">
                      <div className="benefit-item included">
                        <span className="benefit-icon">✓</span>
                        <span>Unlimited users</span>
                      </div>
                      <div className="benefit-item included">
                        <span className="benefit-icon">✓</span>
                        <span>Unlimited projects</span>
                      </div>
                      <div className="benefit-item included">
                        <span className="benefit-icon">✓</span>
                        <span>24/7 support</span>
                      </div>
                      <div className="benefit-item included">
                        <span className="benefit-icon">✓</span>
                        <span>Custom branding</span>
                      </div>
                      <div className="benefit-item included">
                        <span className="benefit-icon">✓</span>
                        <span>Advanced analytics</span>
                      </div>
                      <div className="benefit-item included">
                        <span className="benefit-icon">✓</span>
                        <span>Dedicated account manager</span>
                      </div>
                    </div>
                  </div>

                  <div className="billing-summary-card">
                    <h3>Billing Summary</h3>
                    <div className="summary-grid">
                      <div className="summary-item">
                        <div className="summary-label">Current Month</div>
                        <div className="summary-value">QAR 299</div>
                      </div>
                      <div className="summary-item">
                        <div className="summary-label">Total Paid</div>
                        <div className="summary-value">QAR 875</div>
                      </div>
                      <div className="summary-item">
                        <div className="summary-label">Remaining</div>
                        <div className="summary-value">10 days</div>
                      </div>
                      <div className="summary-item">
                        <div className="summary-label">Annual Savings</div>
                        <div className="summary-value">QAR 2,900</div>
                      </div>
                    </div>
                  </div>

                  <div className="recent-activity-card">
                    <h3>Recent Activity</h3>
                    <div className="activity-list">
                      <div className="activity-item">
                        <div className="activity-content">
                          <div className="activity-title">Subscription renewed</div>
                          <div className="activity-time">2 hours ago</div>
                        </div>
                      </div>
                      <div className="activity-item">
                        <div className="activity-content">
                          <div className="activity-title">Payment successful</div>
                          <div className="activity-time">1 day ago</div>
                        </div>
                      </div>
                      <div className="activity-item">
                        <div className="activity-content">
                          <div className="activity-title">Plan upgraded</div>
                          <div className="activity-time">3 days ago</div>
                        </div>
                      </div>
                      <div className="activity-item">
                        <div className="activity-content">
                          <div className="activity-title">Invoice generated</div>
                          <div className="activity-time">5 days ago</div>
                        </div>
                      </div>
                      <div className="activity-item">
                        <div className="activity-content">
                          <div className="activity-title">Free service</div>
                          <div className="activity-time">1 week ago</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'plan' && (
                <div className="plan-tab">
                  <h2 className="section-title">Choose Your Plan</h2>
                  <div className="plans-grid">
                    <div className="plan-card basic">
                      <div className="plan-card-header">
                        <h3>Basic Plan</h3>
                        <div className="plan-price-large">QAR 99<span>/month</span></div>
                      </div>
                      <ul className="plan-features-list">
                        <li>5 users</li>
                        <li>10 projects</li>
                        <li>100GB storage</li>
                        <li>Basic support</li>
                      </ul>
                      <button className="choose-plan-btn" onClick={() => handleChoosePlan('Basic Plan')}>
                        Choose Plan
                      </button>
                    </div>

                    <div className="plan-card premium current">
                      <div className="current-badge">Current Plan</div>
                      <div className="plan-card-header">
                        <h3>Premium Plan</h3>
                        <div className="plan-price-large">QAR 299<span>/month</span></div>
                      </div>
                      <ul className="plan-features-list">
                        <li>Unlimited users</li>
                        <li>Unlimited projects</li>
                        <li>Unlimited storage</li>
                        <li>24/7 support</li>
                        <li>Custom branding</li>
                        <li>Advanced analytics</li>
                      </ul>
                      <button className="current-plan-btn" type="button">
                        Current Plan
                      </button>
                    </div>

                    <div className="plan-card vip">
                      <div className="plan-card-header">
                        <h3>VIP Plan</h3>
                        <div className="plan-price-large">QAR 699<span>/month</span></div>
                      </div>
                      <ul className="plan-features-list">
                        <li>All Premium features</li>
                        <li>Dedicated account manager</li>
                        <li>Priority support</li>
                        <li>Early access to new features</li>
                      </ul>
                      <button className="choose-plan-btn" onClick={() => handleChoosePlan('VIP Plan')}>
                        Choose Plan
                      </button>
                    </div>
                  </div>

                  <div className="annual-billing-section">
                    <label className="annual-toggle">
                      <input type="checkbox" />
                      <span className="toggle-slider"></span>
                      <span className="toggle-label">Annual Billing (Save up to 20%)</span>
                    </label>
                  </div>
                </div>
              )}

              {activeTab === 'billing' && (
                <div className="billing-tab">
                  <div className="billing-overview-card">
                    <h3>Billing Overview</h3>
                    <div className="overview-stats">
                      <div className="overview-stat">
                        <div className="stat-label">Total Spent</div>
                        <div className="stat-value">QAR 1,584</div>
                      </div>
                      <div className="overview-stat">
                        <div className="stat-label">Discount Applied</div>
                        <div className="stat-value">90%</div>
                      </div>
                      <div className="overview-stat">
                        <div className="stat-label">Current Month</div>
                        <div className="stat-value">QAR 299</div>
                      </div>
                    </div>
                  </div>

                  <div className="billing-history-card">
                    <h3>Billing History</h3>
                    <div className="billing-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Invoice ID</th>
                            <th>Date</th>
                            <th>Period</th>
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
                                  {invoice.status === 'paid' ? 'Paid' : 'Due'}
                                </span>
                              </td>
                              <td>
                                <div className="action-buttons">
                                  <button
                                    className="action-icon"
                                    title="Download"
                                    onClick={() => handleDownloadInvoice(invoice)}
                                  >
                                    ⬇
                                  </button>
                                  <button
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
                  </div>
                </div>
              )}

              {activeTab === 'payment' && (
                <div className="payment-tab">
                  <div className="payment-methods-card">
                    <h3>Payment Methods</h3>
                    {paymentMethods.map((method) => (
                      <div key={method.id} className="payment-method-item">
                        <div className="payment-method-info">
                          <div className="payment-icon"><CreditCard size={16} /></div>
                          <div className="payment-details">
                            <div className="payment-type">
                              {method.brand} **** {method.last4}
                            </div>
                            <div className="payment-expiry">
                              Expires {String(method.expiryMonth).padStart(2, '0')}/{String(method.expiryYear).slice(-2)}
                            </div>
                          </div>
                        </div>
                        <div className="payment-actions">
                          <button
                            className="payment-action-btn"
                            onClick={() => {
                              if (method.isDefault) return
                              setPaymentMethods((prev) =>
                                prev.map((item) => ({ ...item, isDefault: item.id === method.id }))
                              )
                            }}
                          >
                            {method.isDefault ? 'Default' : 'Set as Default'}
                          </button>
                          <button
                            className="payment-action-btn remove"
                            onClick={() => setPaymentMethods((prev) => prev.filter(item => item.id !== method.id))}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      className="add-payment-btn"
                      onClick={() => setShowAddPaymentModal(true)}
                    >
                      Add New Payment Method
                    </button>
                  </div>

                  <div className="payment-warning">
                    <span className="warning-icon">⚠</span>
                    <span>Your default payment method is expired. Please update your payment method to avoid service interruption.</span>
                  </div>
                </div>
              )}

              {activeTab === 'usage' && (
                <div className="usage-tab">
                  <h2 className="section-title">Usage Analytics</h2>
                  <div className="usage-cards">
                    <div className="usage-card">
                      <div className="usage-header">
                        <span className="usage-label">Storage Used</span>
                        <span className="usage-percentage">75%</span>
                      </div>
                      <div className="usage-progress">
                        <div className="usage-progress-bar" style={{ width: '75%' }}></div>
                      </div>
                    </div>
                    <div className="usage-card">
                      <div className="usage-header">
                        <span className="usage-label">Premium Users</span>
                        <span className="usage-percentage">45%</span>
                      </div>
                      <div className="usage-progress">
                        <div className="usage-progress-bar" style={{ width: '45%' }}></div>
                      </div>
                    </div>
                    <div className="usage-card">
                      <div className="usage-header">
                        <span className="usage-label">Project Uploads</span>
                        <span className="usage-percentage">80%</span>
                      </div>
                      <div className="usage-progress">
                        <div className="usage-progress-bar" style={{ width: '80%' }}></div>
                      </div>
                    </div>
                    <div className="usage-card">
                      <div className="usage-header">
                        <span className="usage-label">API Requests</span>
                        <span className="usage-percentage">60%</span>
                      </div>
                      <div className="usage-progress">
                        <div className="usage-progress-bar" style={{ width: '60%' }}></div>
                      </div>
                    </div>
                    <div className="usage-card">
                      <div className="usage-header">
                        <span className="usage-label">Meeting Minutes</span>
                        <span className="usage-percentage">30%</span>
                      </div>
                      <div className="usage-progress">
                        <div className="usage-progress-bar" style={{ width: '30%' }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="usage-insights-card">
                    <div className="insights-icon"><Lightbulb size={18} /></div>
                    <div className="insights-content">
                      <h3>Usage Insights</h3>
                      <p>Understanding your usage patterns can help you optimize your plan. Our insights highlight areas where you might be over- or under-utilizing your subscription.</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'help' && (
                <div className="help-tab">
                  <h2 className="section-title">Help & Support</h2>
                  <p>Get help with your subscription, billing, and payment questions.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showCancelModal && (
        <div className="modal-overlay" onClick={handleCloseCancelModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Cancel Subscription</h2>
            <p className="modal-message">Are you sure you want to cancel your subscription? This action cannot be undone.</p>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={handleCloseCancelModal}>
                Cancel
              </button>
              <button className="modal-btn keep" onClick={handleCloseCancelModal}>
                Keep Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddPaymentModal && (
        <div className="modal-overlay" onClick={() => setShowAddPaymentModal(false)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <h2 className="modal-title">Add Payment Method</h2>
            <div className="modal-form">
              <label>
                Cardholder Name
                <input
                  type="text"
                  value={newPayment.name}
                  onChange={(event) => setNewPayment((prev) => ({ ...prev, name: event.target.value }))}
                />
              </label>
              <label>
                Card Number
                <input
                  type="text"
                  inputMode="numeric"
                  value={newPayment.cardNumber}
                  onChange={(event) => setNewPayment((prev) => ({ ...prev, cardNumber: event.target.value }))}
                />
              </label>
              <div className="modal-form__row">
                <label>
                  Expiry Month
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newPayment.expiryMonth}
                    onChange={(event) => setNewPayment((prev) => ({ ...prev, expiryMonth: event.target.value }))}
                  />
                </label>
                <label>
                  Expiry Year
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newPayment.expiryYear}
                    onChange={(event) => setNewPayment((prev) => ({ ...prev, expiryYear: event.target.value }))}
                  />
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button className="modal-btn cancel" onClick={() => setShowAddPaymentModal(false)}>
                Cancel
              </button>
              <button
                className="modal-btn keep"
                onClick={() => {
                  const last4 = newPayment.cardNumber.slice(-4)
                  if (!newPayment.cardNumber || last4.length < 4) {
                    setInfoModal({
                      title: 'Payment Method',
                      message: 'Please enter a valid card number.',
                    })
                    return
                  }
                  setPaymentMethods((prev) => [
                    {
                      id: `pm_${Date.now()}`,
                      brand: 'Visa',
                      last4,
                      expiryMonth: Number(newPayment.expiryMonth || 1),
                      expiryYear: Number(newPayment.expiryYear || new Date().getFullYear()),
                      isDefault: prev.length === 0,
                    },
                    ...prev,
                  ])
                  setNewPayment({ cardNumber: '', expiryMonth: '', expiryYear: '', name: '' })
                  setShowAddPaymentModal(false)
                }}
              >
                Save Card
              </button>
            </div>
          </div>
        </div>
      )}

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
