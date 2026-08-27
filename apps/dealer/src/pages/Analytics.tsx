import { formatDate } from '@carflow/shared'
import { CalendarDays, Download, DollarSign, LineChart as LineChartIcon, Users, Car, Star, Lightbulb } from 'lucide-react'
import { useState, useCallback, memo, useEffect, useMemo } from 'react'
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import type { DealerAnalyticsData, DealerAnalyticsInsights } from '../services/dealerService'
import { getDealerAnalytics, getDealerAnalyticsInsights } from '../services/dealerService'
import './Analytics.css'

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'] as const

const EMPTY_PIE = [{ name: 'No data', value: 1 }]
const EMPTY_LINE = [{ month: 'No data', revenue: 0, profit: 0 }]
const EMPTY_REVENUE_BOOKING = [{ month: 'No data', revenue: 0, bookings: 0 }]
const EMPTY_BAR_TIME = [{ time: 'No data', bookings: 0 }]
const EMPTY_BAR_UTIL = [{ category: 'No data', utilization: 0 }]

type DateRangeKey = '7d' | '30d' | '90d'

function getRowTime(row: { createdAt?: string; month?: string }): number {
  const raw = row.createdAt ?? row.month
  if (!raw) return NaN
  const t = new Date(raw).getTime()
  return Number.isFinite(t) ? t : NaN
}

function filterSeriesForRange<T extends { createdAt?: string; month?: string }>(
  rows: T[],
  range: DateRangeKey
): T[] {
  if (!rows.length) return rows
  const sorted = [...rows].sort((a, b) => getRowTime(a) - getRowTime(b))
  if (range === '90d') return sorted

  const days = range === '7d' ? 7 : 30
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  const byDate = sorted.filter((r) => {
    const t = getRowTime(r)
    return Number.isFinite(t) && t >= cutoff
  })
  if (byDate.length > 0) return byDate

  const n = range === '7d' ? 7 : 30
  return sorted.slice(-n)
}

export const Analytics = memo(function Analytics() {
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'customers' | 'vehicles' | 'insights'>('overview')
  const [analytics, setAnalytics] = useState<DealerAnalyticsData | null>(null)
  const [insightsData, setInsightsData] = useState<DealerAnalyticsInsights | null>(null)
  const [dateRange, setDateRange] = useState<DateRangeKey>('7d')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const [data, insights] = await Promise.all([getDealerAnalytics(), getDealerAnalyticsInsights()])
        if (!cancelled) {
          setAnalytics(data)
          setInsightsData(insights)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load analytics')
          setAnalytics(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const revenueTrendFiltered = useMemo(
    () => filterSeriesForRange(analytics?.revenueTrend ?? [], dateRange),
    [analytics?.revenueTrend, dateRange]
  )

  const revenueBookingFiltered = useMemo(
    () => filterSeriesForRange(analytics?.revenueBooking ?? [], dateRange),
    [analytics?.revenueBooking, dateRange]
  )

  const handleTabChange = useCallback((tab: typeof activeTab) => {
    setActiveTab(tab)
  }, [])

  return (
    <div className="analytics-page">
      <Sidebar />
      <Header />
      
      <div className="analytics-content" role="main">
        <div className="page-header">
          <div className="page-title-section">
            <h1 className="page-title">Advanced Analytics</h1>
            <p className="page-subtitle">Comprehensive insights and performance metrics</p>
          </div>
          <div className="page-actions">
            <div className="date-filter">
              <CalendarDays size={14} />
              <select
                aria-label="Date range"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as DateRangeKey)}
              >
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </div>
            <button
              className="export-btn"
              type="button"
              onClick={() => {
                const revenueData = revenueTrendFiltered
                const rows = (revenueData.length > 0 ? revenueData : []).map(row => ({
                  month: row.month,
                  revenue: String(row.revenue),
                  profit: String(row.profit ?? row.revenue * 0.2),
                }))
                const headers = Object.keys(rows[0] ?? {})
                const csv = [
                  headers.join(','),
                  ...rows.map(row => headers.map(header => `"${row[header as keyof typeof row] ?? ''}"`).join(',')),
                ].join('\n')
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
                const link = document.createElement('a')
                link.href = URL.createObjectURL(blob)
                link.setAttribute('download', 'dealer-analytics.csv')
                document.body.appendChild(link)
                link.click()
                link.remove()
              }}
            >
              <Download size={14} />
              <span>Export</span>
            </button>
          </div>
        </div>

        {loading && <div className="analytics-loading" role="status">Loading analytics...</div>}
        {error && !loading && (
          <div className="analytics-error" role="alert">
            {error}
          </div>
        )}

        <div className="tabs-wrapper">
          <div className="tabs">
            <button 
              className={`tab ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => handleTabChange('overview')}
            >
              Overview
            </button>
            <button 
              className={`tab ${activeTab === 'revenue' ? 'active' : ''}`}
              onClick={() => handleTabChange('revenue')}
            >
              Revenue
            </button>
            <button 
              className={`tab ${activeTab === 'customers' ? 'active' : ''}`}
              onClick={() => handleTabChange('customers')}
            >
              Customers
            </button>
            <button 
              className={`tab ${activeTab === 'vehicles' ? 'active' : ''}`}
              onClick={() => handleTabChange('vehicles')}
            >
              Vehicles
            </button>
            <button 
              className={`tab ${activeTab === 'insights' ? 'active' : ''}`}
              onClick={() => handleTabChange('insights')}
            >
              Insights
            </button>
          </div>

          <div className="tab-content">
            {activeTab === 'overview' && (
              <div className="overview-tab">
                <div className="stats-grid">
                  <div className="stat-card">
                    <div className="stat-info">
                      <div className="stat-label">Total Revenue</div>
                      <div className="stat-value">QAR {(analytics?.totalRevenue ?? 0).toLocaleString()}</div>
                      <div className="stat-change positive"><span>All time</span></div>
                    </div>
                    <div className="stat-icon"><DollarSign size={18} /></div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-info">
                      <div className="stat-label">Active Bookings</div>
                      <div className="stat-value">{analytics?.activeBookings ?? 0}</div>
                      <div className="stat-change positive"><span>Currently active</span></div>
                    </div>
                    <div className="stat-icon"><CalendarDays size={18} /></div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-info">
                      <div className="stat-label">New Customers</div>
                      <div className="stat-value">{analytics?.newCustomersThisMonth ?? 0}</div>
                      <div className="stat-change positive"><span>This month</span></div>
                    </div>
                    <div className="stat-icon"><Users size={18} /></div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-info">
                      <div className="stat-label">Fleet Utilization</div>
                      <div className="stat-value">{analytics?.fleetUtilization ?? 0}%</div>
                      <div className="stat-change positive"><span>Average rate</span></div>
                    </div>
                    <div className="stat-icon"><Car size={18} /></div>
                  </div>
                </div>

                <div className="charts-grid">
                  <div className="chart-card">
                    <div className="chart-header">
                      <h3 className="chart-title"><LineChartIcon size={16} /> Revenue Trends</h3>
                      <p className="chart-description">Monthly revenue and profit comparison</p>
                    </div>
                    <div className="chart-placeholder">
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={(revenueTrendFiltered.length > 0 ? revenueTrendFiltered : EMPTY_LINE)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                          <XAxis dataKey="month" stroke="#666" tick={{ fontSize: 12 }} />
                          <YAxis stroke="#666" tick={{ fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: '#fff',
                              border: '1px solid #e5e5e5',
                              borderRadius: '4px'
                            }}
                          />
                          <Legend />
                          <Line type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} name="Revenue" />
                          <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} name="Profit" connectNulls />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="chart-card">
                    <div className="chart-header">
                      <h3 className="chart-title"><Users size={16} /> Customer Demographics</h3>
                      <p className="chart-description">Age distribution of customers</p>
                    </div>
                    <div className="chart-placeholder">
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie
                            data={(analytics?.customerDemographics?.length ?? 0) > 0 ? analytics!.customerDemographics : EMPTY_PIE}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, value }) => (value > 0 ? `${name}: ${value}%` : name)}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {((analytics?.customerDemographics?.length ?? 0) > 0 ? analytics!.customerDemographics : EMPTY_PIE).map((entry, index) => (
                              <Cell key={`cell-${entry.name}-${index}`} fill={(entry.value ?? 0) > 0 ? PIE_COLORS[index % PIE_COLORS.length] : '#e5e7eb'} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="vehicles-list-card">
                  <div className="card-header">
                    <h3 className="card-title"><Star size={16} /> Utilization by Category</h3>
                    <p className="card-description">Fleet utilization by vehicle category</p>
                  </div>
                  <div className="vehicles-list">
                    {((analytics?.utilization?.length ?? 0) > 0 ? analytics!.utilization : []).map((item, index) => (
                      <div key={`${item.category}-${index}`} className="vehicle-item">
                        <div className="vehicle-info">
                          <div className="vehicle-rank">{index + 1}</div>
                          <div className="vehicle-details">
                            <div className="vehicle-name">{item.category}</div>
                            <div className="vehicle-bookings">{item.utilization}% utilization</div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(!analytics?.utilization?.length) && (
                      <div className="vehicle-item">
                        <div className="vehicle-info">
                          <div className="vehicle-details">
                            <div className="vehicle-name">No utilization data</div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'revenue' && (
              <div className="revenue-tab">
                <div className="charts-row">
                  <div className="chart-card large">
                    <div className="chart-header">
                      <h3 className="chart-title">Revenue vs Bookings Correlation</h3>
                      <p className="chart-description">Monthly revenue and booking trends</p>
                    </div>
                    <div className="chart-placeholder">
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={(revenueBookingFiltered.length > 0 ? revenueBookingFiltered : EMPTY_REVENUE_BOOKING)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                          <XAxis
                            dataKey="month"
                            stroke="#666"
                            tick={{ fontSize: 12 }}
                            tickFormatter={(v) => {
                              const d = new Date(v)
                              return Number.isFinite(d.getTime()) ? formatDate(d) : String(v)
                            }}
                          />
                          <YAxis yAxisId="left" stroke="#666" tick={{ fontSize: 12 }} />
                          <YAxis yAxisId="right" orientation="right" stroke="#666" tick={{ fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: '#fff',
                              border: '1px solid #e5e5e5',
                              borderRadius: '4px'
                            }}
                          />
                          <Legend />
                          <Line 
                            yAxisId="left"
                            type="monotone" 
                            dataKey="revenue" 
                            stroke="#6366f1" 
                            strokeWidth={3}
                            dot={{ fill: '#6366f1', r: 6 }}
                            name="Revenue (QAR)"
                          />
                          <Line 
                            yAxisId="right"
                            type="monotone" 
                            dataKey="bookings" 
                            stroke="#10b981" 
                            strokeWidth={3}
                            dot={{ fill: '#10b981', r: 6 }}
                            name="Bookings"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="revenue-breakdown-card">
                    <div className="chart-header">
                      <h3 className="chart-title">Revenue Breakdown</h3>
                      <p className="chart-description">This month&apos;s revenue sources</p>
                    </div>
                    <div className="revenue-items">
                      {analytics?.totalRevenue != null && analytics.totalRevenue > 0 ? (
                        <div className="revenue-item">
                          <div className="revenue-item-header">
                            <span className="revenue-item-label">Total Revenue</span>
                            <span className="revenue-item-amount">QAR {analytics.totalRevenue.toLocaleString()}</span>
                          </div>
                          <div className="revenue-bar">
                            <div className="revenue-bar-fill" style={{ width: '100%' }}></div>
                          </div>
                        </div>
                      ) : (
                        <div className="revenue-item">
                          <div className="revenue-item-header">
                            <span className="revenue-item-label">No revenue data</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'customers' && (
              <div className="customers-tab">
                <div className="charts-row">
                  <div className="chart-card large">
                    <div className="chart-header">
                      <h3 className="chart-title">Booking Patterns by Time</h3>
                      <p className="chart-description">Peak booking hours analysis</p>
                    </div>
                    <div className="chart-placeholder">
                      <ResponsiveContainer width="100%" height={224}>
                        <BarChart data={(analytics?.bookingTime?.length ?? 0) > 0 ? analytics!.bookingTime : EMPTY_BAR_TIME}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                          <XAxis dataKey="time" stroke="#666" tick={{ fontSize: 12 }} />
                          <YAxis stroke="#666" tick={{ fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: '#fff',
                              border: '1px solid #e5e5e5',
                              borderRadius: '4px'
                            }}
                          />
                          <Bar dataKey="bookings" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'vehicles' && (
              <div className="vehicles-tab">
                <div className="charts-row">
                  <div className="chart-card">
                    <div className="chart-header">
                      <h3 className="chart-title">Fleet Utilization by Category</h3>
                      <p className="chart-description">Utilization rates across vehicle types</p>
                    </div>
                    <div className="chart-placeholder">
                      <ResponsiveContainer width="100%" height={224}>
                        <BarChart data={(analytics?.utilization?.length ?? 0) > 0 ? analytics!.utilization : EMPTY_BAR_UTIL}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                          <XAxis dataKey="category" stroke="#666" tick={{ fontSize: 12 }} />
                          <YAxis stroke="#666" tick={{ fontSize: 12 }} domain={[0, 100]} />
                          <Tooltip 
                            contentStyle={{ 
                              backgroundColor: '#fff',
                              border: '1px solid #e5e5e5',
                              borderRadius: '4px'
                            }}
                            formatter={(value: number) => [`${value}%`, 'Utilization']}
                          />
                          <Bar dataKey="utilization" fill="#6366f1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="maintenance-card">
                    <div className="chart-header">
                      <h3 className="chart-title">Maintenance Schedule</h3>
                      <p className="chart-description">Upcoming maintenance requirements</p>
                    </div>
                    <div className="maintenance-list">
                      <div className="maintenance-item">
                        <div className="maintenance-info">
                          <div className="maintenance-vehicle">No maintenance data available</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'insights' && (
              <div className="insights-tab">
                <div className="insights-header">
                  <div className="insights-title-section">
                    <span className="insights-icon"><Lightbulb size={16} /></span>
                    <h3 className="insights-main-title">Insights &amp; recommendations</h3>
                  </div>
                  <p className="insights-subtitle">Rule-based fleet and operations guidance</p>
                </div>

                {insightsData ? (
                  <div className="stats-grid" style={{ marginBottom: '20px' }}>
                    <div className="stat-card">
                      <div className="stat-info">
                        <div className="stat-label">Fleet total</div>
                        <div className="stat-value">{insightsData.fleet.total}</div>
                      </div>
                      <div className="stat-icon"><Car size={18} /></div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-info">
                        <div className="stat-label">Utilization</div>
                        <div className="stat-value">{insightsData.fleet.utilizationPct}%</div>
                      </div>
                      <div className="stat-icon"><LineChartIcon size={18} /></div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-info">
                        <div className="stat-label">Rented</div>
                        <div className="stat-value">{insightsData.fleet.rented}</div>
                      </div>
                      <div className="stat-icon"><CalendarDays size={18} /></div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-info">
                        <div className="stat-label">In maintenance</div>
                        <div className="stat-value">{insightsData.fleet.maintenance}</div>
                      </div>
                      <div className="stat-icon"><Car size={18} /></div>
                    </div>
                  </div>
                ) : null}

                <div className="insights-grid">
                  {(insightsData?.insights?.length ? insightsData.insights : ['No insights available yet.']).map(
                    (insight, i) => (
                      <div key={i} className="insight-card">
                        <div className="insight-header">
                          <h4 className="insight-title">Recommendation {i + 1}</h4>
                          <span className="insight-badge info">insight</span>
                        </div>
                        <p className="insight-description">{insight}</p>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
