import { useMemo, memo, useEffect, useState } from 'react'
import type { DealerDashboardData, DealerDashboardRecentRental } from '../services/dealerService'
import { getDealerDashboard, recordOfflinePayment } from '../services/dealerService'
import { getCurrentUser } from '../services/authService'
import { Sidebar } from '../components/Sidebar'
import { Header } from '../components/Header'
import { toast } from 'sonner'
import { CalendarDays, Car, DollarSign, Users } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './Dashboard.css'


// Memoize chart config to prevent recreation
const chartConfig = {
  margin: { top: 5, right: 30, left: 20, bottom: 5 },
  tooltipStyle: {
    backgroundColor: '#fff',
    border: '1px solid #e5e5e5',
    borderRadius: '4px'
  }
} as const

export const Dashboard = memo(function Dashboard() {
  const [dashboard, setDashboard] = useState<DealerDashboardData | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payModal, setPayModal] = useState<DealerDashboardRecentRental | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState<'card' | 'bank' | 'wallet'>('bank')
  const [paySubmitting, setPaySubmitting] = useState(false)

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    getDealerDashboard()
      .then(setDashboard)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard'))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    getCurrentUser()
      .then((user) => setUserName(user?.name ?? null))
      .catch(() => setUserName(null))
  }, [])

  // Memoize tooltip formatter to prevent recreation
  const formatTooltip = useMemo(() => {
    return (value: number) => [`QAR ${value.toLocaleString()}`, 'Revenue'] as const
  }, [])

  const kpis = useMemo(() => {
    const map = new Map(dashboard?.kpis.map(kpi => [kpi.label, kpi.value]))
    return {
      revenue: map.get('Total Revenue') ?? 0,
      totalRentals: map.get('Total Rentals') ?? 0,
      activeVehicles: map.get('Active Vehicles') ?? 0,
      leads: map.get('Active Leads') ?? 0,
    }
  }, [dashboard])

  const revenueChartData = dashboard?.revenueChartData ?? []
  const recentRentals = dashboard?.recentRentals ?? []
  const vehiclesWithStatus = dashboard?.vehiclesWithStatus ?? []

  const formatBookingTime = (createdAt: string) => {
    const d = new Date(createdAt)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000))
    if (diffDays === 0) return `Today, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
    if (diffDays === 1) return `Yesterday, ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const statusLabel = (status: string) => {
    if (status === 'active') return 'Active'
    if (status === 'reserved') return 'Confirmed'
    if (status === 'completed') return 'Completed'
    if (status === 'cancelled') return 'Cancelled'
    return status
  }

  const openPayModal = (booking: DealerDashboardRecentRental) => {
    setPayModal(booking)
    setPayAmount(booking.totalAmount > 0 ? String(booking.totalAmount) : '')
    setPayMethod('bank')
  }

  const submitOfflinePayment = () => {
    if (!payModal) return
    const n = parseFloat(payAmount.replace(/,/g, ''))
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Enter a valid amount in QAR.')
      return
    }
    setPaySubmitting(true)
    recordOfflinePayment({ rentalId: payModal.id, amount: n, method: payMethod })
      .then(() => {
        toast.success('Payment recorded')
        setPayModal(null)
        return getDealerDashboard().then(setDashboard)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Could not record payment'))
      .finally(() => setPaySubmitting(false))
  }

  const vehicleStatusLabel = (status: string) => {
    if (status === 'available') return 'Available'
    if (status === 'rented') return 'Rented'
    if (status === 'maintenance') return 'Maintenance'
    return status
  }

  return (
    <div className="dashboard-page">
      <Sidebar />
      <Header />
      
      <div className="dashboard-content">
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, {userName ?? 'Dealer'}</p>
        </div>

        {isLoading ? (
          <div className="dashboard-loading" style={{ textAlign: 'center', padding: '4rem 0', color: '#888' }}>
            Loading dashboard...
          </div>
        ) : error ? (
          <div className="dashboard-error" style={{ textAlign: 'center', padding: '4rem 0', color: '#dc2626' }}>
            {error}
          </div>
        ) : (
        <>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-info">
              <div className="stat-label">Total Revenue</div>
              <div className="stat-value">QAR {Number(kpis.revenue).toLocaleString('en-US')}</div>
            </div>
            <div className="stat-icon"><DollarSign size={18} /></div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <div className="stat-label">Total Bookings</div>
              <div className="stat-value">{kpis.totalRentals}</div>
            </div>
            <div className="stat-icon"><CalendarDays size={18} /></div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <div className="stat-label">Active Vehicles</div>
              <div className="stat-value">{kpis.activeVehicles}</div>
            </div>
            <div className="stat-icon"><Car size={18} /></div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <div className="stat-label">Active Leads</div>
              <div className="stat-value">{kpis.leads}</div>
            </div>
            <div className="stat-icon"><Users size={18} /></div>
          </div>
        </div>

        <div className="revenue-chart-card">
          <div className="card-header">
            <h3 className="card-title">Revenue Overview</h3>
            <p className="card-description">Monthly revenue for the past 6 months</p>
          </div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={revenueChartData.length > 0 ? revenueChartData : [{ month: 'No data', revenue: 0 }]} margin={chartConfig.margin}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis 
                  dataKey="month" 
                  stroke="#666"
                  tick={{ fontSize: 12 }}
                  tickLine={{ stroke: '#666' }}
                />
                <YAxis 
                  stroke="#666"
                  tick={{ fontSize: 12 }}
                  tickLine={{ stroke: '#666' }}
                  domain={['auto', 'auto']}
                />
                <Tooltip 
                  contentStyle={chartConfig.tooltipStyle}
                  formatter={formatTooltip}
                />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#6366f1" 
                  strokeWidth={3}
                  dot={{ fill: '#6366f1', r: 6 }}
                  activeDot={{ r: 8 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bottom-section">
          <div className="recent-bookings-card">
            <h3 className="card-title">Recent Bookings</h3>
            <p className="card-hint">Record cash, transfer, or POS payments taken outside CarFlow.</p>
            <div className="bookings-list">
              {recentRentals.length === 0 ? (
                <div className="booking-item">
                  <div className="booking-info">
                    <div className="booking-name">No recent bookings</div>
                  </div>
                </div>
              ) : (
                recentRentals.map((booking) => (
                  <div key={booking.id} className="booking-item">
                    <div className="booking-info">
                      <div className="booking-name">{booking.customerName}</div>
                      <div className="booking-details">{booking.vehicleName} • {formatBookingTime(booking.createdAt)}</div>
                    </div>
                    <div className="booking-item-right">
                      <div className={`booking-badge ${booking.status === 'active' ? 'active' : booking.status === 'reserved' ? 'confirmed' : booking.status === 'completed' ? 'completed' : ''}`}>{statusLabel(booking.status)}</div>
                      <div className="booking-payment-row">
                        {booking.paymentStatus === 'completed' ? (
                          <span className="booking-pay-tag booking-pay-tag--paid">Paid</span>
                        ) : (
                          <>
                            <span className="booking-pay-tag booking-pay-tag--unpaid">Unpaid</span>
                            <button type="button" className="booking-record-pay-btn" onClick={() => openPayModal(booking)}>
                              Record payment
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="vehicle-status-card">
            <h3 className="card-title">Vehicle Status</h3>
            <div className="vehicles-list">
              {vehiclesWithStatus.length === 0 ? (
                <div className="vehicle-item">
                  <div className="vehicle-info">
                    <span className="vehicle-name">No vehicles in inventory</span>
                  </div>
                </div>
              ) : (
                vehiclesWithStatus.map((v) => (
                  <div key={v.id} className="vehicle-item">
                    <div className="vehicle-info">
                      <div className={`status-dot ${v.status}`}></div>
                      <span className="vehicle-name">{v.name}</span>
                    </div>
                    <div className="vehicle-badge">{vehicleStatusLabel(v.status)}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        </>
        )}
      </div>

      {payModal && (
        <div className="dash-pay-overlay" role="dialog" aria-modal="true" aria-labelledby="dash-pay-title" onClick={() => !paySubmitting && setPayModal(null)}>
          <div className="dash-pay-modal" onClick={(e) => e.stopPropagation()}>
            <h3 id="dash-pay-title">Record offline payment</h3>
            <p className="dash-pay-desc">
              Use this when the customer paid in cash, by bank transfer, or on your POS — not through CarFlow.
            </p>
            <label className="dash-pay-label">
              Amount (QAR)
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                disabled={paySubmitting}
              />
            </label>
            <label className="dash-pay-label">
              Method
              <select value={payMethod} onChange={(e) => setPayMethod(e.target.value as 'card' | 'bank' | 'wallet')} disabled={paySubmitting}>
                <option value="bank">Bank transfer / cash deposit</option>
                <option value="wallet">Mobile wallet / other</option>
                <option value="card">Card (terminal)</option>
              </select>
            </label>
            <div className="dash-pay-actions">
              <button type="button" className="dash-pay-cancel" disabled={paySubmitting} onClick={() => setPayModal(null)}>
                Cancel
              </button>
              <button type="button" className="dash-pay-submit" disabled={paySubmitting} onClick={() => void submitOfflinePayment()}>
                {paySubmitting ? 'Saving…' : 'Mark as paid'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
})
