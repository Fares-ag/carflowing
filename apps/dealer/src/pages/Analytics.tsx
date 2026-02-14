import { useState, useCallback, memo, useEffect } from 'react'
import type { DealerAnalyticsData } from '../services/dealerService'
import { getDealerAnalytics } from '../services/dealerService'
import { Sidebar } from '../components/Sidebar'
import { Header } from '../components/Header'
import { CalendarDays, Download, DollarSign, LineChart as LineChartIcon, Users, Car, Star, Lightbulb } from 'lucide-react'
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts'
import './Analytics.css'

// Move constants outside component to prevent recreation
const REVENUE_TREND_DATA = [
  { month: 'Jan', revenue: 45000, profit: 32000 },
  { month: 'Feb', revenue: 52000, profit: 38000 },
  { month: 'Mar', revenue: 48000, profit: 35000 },
  { month: 'Apr', revenue: 65000, profit: 48000 },
  { month: 'May', revenue: 70000, profit: 52000 },
  { month: 'Jun', revenue: 85000, profit: 63000 },
]

const CUSTOMER_DEMOGRAPHICS_DATA = [
  { name: '25-34', value: 35 },
  { name: '35-44', value: 28 },
  { name: '45-54', value: 20 },
  { name: '18-24', value: 12 },
  { name: '55+', value: 5 },
]

const PIE_COLORS = ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe'] as const

const REVENUE_BOOKING_DATA = [
  { month: 'Jan', revenue: 32000, bookings: 45 },
  { month: 'Feb', revenue: 35000, bookings: 50 },
  { month: 'Mar', revenue: 34000, bookings: 48 },
  { month: 'Apr', revenue: 39000, bookings: 55 },
  { month: 'May', revenue: 41000, bookings: 58 },
  { month: 'Jun', revenue: 42000, bookings: 60 },
]

const BOOKING_TIME_DATA = [
  { time: '6AM', bookings: 7 },
  { time: '8AM', bookings: 12 },
  { time: '10AM', bookings: 18 },
  { time: '12PM', bookings: 24 },
  { time: '2PM', bookings: 21 },
  { time: '4PM', bookings: 28 },
  { time: '6PM', bookings: 15 },
  { time: '8PM', bookings: 9 },
  { time: '10PM', bookings: 5 },
]

const UTILIZATION_DATA = [
  { category: 'SUV', utilization: 85 },
  { category: 'Sedan', utilization: 70 },
  { category: 'Hatchback', utilization: 55 },
  { category: 'Coupe', utilization: 45 },
]

export const Analytics = memo(function Analytics() {
  const [activeTab, setActiveTab] = useState<'overview' | 'revenue' | 'customers' | 'vehicles' | 'insights'>('overview')
  const [analytics, setAnalytics] = useState<DealerAnalyticsData | null>(null)

  useEffect(() => {
    getDealerAnalytics().then(setAnalytics)
  }, [])

  // Memoize tab change handler
  const handleTabChange = useCallback((tab: typeof activeTab) => {
    setActiveTab(tab)
  }, [])

  return (
    <div className="analytics-page">
      <Sidebar />
      <Header />
      
      <div className="analytics-content">
        <div className="page-header">
          <div className="page-title-section">
            <h1 className="page-title">Advanced Analytics</h1>
            <p className="page-subtitle">Comprehensive insights and performance metrics</p>
          </div>
          <div className="page-actions">
            <div className="date-filter">
              <CalendarDays size={14} />
              <select aria-label="Date range" defaultValue="7d">
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
              </select>
            </div>
            <button
              className="export-btn"
              type="button"
              onClick={() => {
                const rows = (analytics?.revenueTrend ?? REVENUE_TREND_DATA).map(row => ({
                  month: row.month,
                  revenue: String(row.revenue),
                  profit: String(row.profit),
                }))
                const headers = Object.keys(rows[0] ?? {})
                const csv = [
                  headers.join(','),
                  ...rows.map(row => headers.map(header => `"${row[header] ?? ''}"`).join(',')),
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
                      <div className="stat-value">QAR 67,000</div>
                      <div className="stat-change positive">+12.5% <span>This month</span></div>
                    </div>
                    <div className="stat-icon"><DollarSign size={18} /></div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-info">
                      <div className="stat-label">Active Bookings</div>
                      <div className="stat-value">180</div>
                      <div className="stat-change positive">+8.2% <span>Currently active</span></div>
                    </div>
                    <div className="stat-icon"><CalendarDays size={18} /></div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-info">
                      <div className="stat-label">New Customers</div>
                      <div className="stat-value">148</div>
                      <div className="stat-change positive">+15.3% <span>This month</span></div>
                    </div>
                    <div className="stat-icon"><Users size={18} /></div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-info">
                      <div className="stat-label">Fleet Utilization</div>
                      <div className="stat-value">73%</div>
                      <div className="stat-change positive">+5.1% <span>Average rate</span></div>
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
                        <LineChart data={analytics?.revenueTrend ?? REVENUE_TREND_DATA}>
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
                          <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} name="Profit" />
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
                            data={analytics?.customerDemographics ?? CUSTOMER_DEMOGRAPHICS_DATA}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, value }) => `${name}: ${value}%`}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {(analytics?.customerDemographics ?? CUSTOMER_DEMOGRAPHICS_DATA).map((entry, index) => (
                              <Cell key={`cell-${entry.name}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
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
                    <h3 className="card-title"><Star size={16} /> Top Performing Vehicles</h3>
                    <p className="card-description">Vehicles ranked by bookings and revenue</p>
                  </div>
                  <div className="vehicles-list">
                    {[
                      { rank: 1, name: 'BMW X3 2024', bookings: '45 bookings', revenue: 'QAR 13,500', utilization: '85% utilization', rating: '4.8' },
                      { rank: 2, name: 'Mercedes C-Class', bookings: '38 bookings', revenue: 'QAR 9,500', utilization: '72% utilization', rating: '4.9' },
                      { rank: 3, name: 'Audi A4 2023', bookings: '32 bookings', revenue: 'QAR 8,960', utilization: '68% utilization', rating: '4.7' },
                      { rank: 4, name: 'Toyota Camry', bookings: '28 bookings', revenue: 'QAR 5,600', utilization: '58% utilization', rating: '4.6' },
                      { rank: 5, name: 'Nissan Altima', bookings: '22 bookings', revenue: 'QAR 4,400', utilization: '45% utilization', rating: '4.5' },
                    ].map((vehicle) => (
                      <div key={vehicle.rank} className="vehicle-item">
                        <div className="vehicle-info">
                          <div className="vehicle-rank">{vehicle.rank}</div>
                          <div className="vehicle-details">
                            <div className="vehicle-name">{vehicle.name}</div>
                            <div className="vehicle-bookings">{vehicle.bookings}</div>
                          </div>
                        </div>
                        <div className="vehicle-stats">
                          <div className="vehicle-revenue-info">
                            <div className="vehicle-revenue">{vehicle.revenue}</div>
                            <div className="vehicle-utilization">{vehicle.utilization}</div>
                          </div>
                          <div className="vehicle-rating">
                            <Star size={14} />
                            <span>{vehicle.rating}</span>
                          </div>
                        </div>
                      </div>
                    ))}
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
                        <LineChart data={analytics?.revenueBooking ?? REVENUE_BOOKING_DATA}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                          <XAxis dataKey="month" stroke="#666" tick={{ fontSize: 12 }} />
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
                      <p className="chart-description">This month's revenue sources</p>
                    </div>
                    <div className="revenue-items">
                      {[
                        { label: 'Daily Rentals', amount: 'QAR 35,200', percent: 55 },
                        { label: 'Weekly Rentals', amount: 'QAR 20,100', percent: 31 },
                        { label: 'Monthly Rentals', amount: 'QAR 8,700', percent: 14 },
                        { label: 'Insurance & Fees', amount: 'QAR 3,000', percent: 5 },
                      ].map((item) => (
                        <div key={item.label} className="revenue-item">
                          <div className="revenue-item-header">
                            <span className="revenue-item-label">{item.label}</span>
                            <span className="revenue-item-amount">{item.amount}</span>
                          </div>
                          <div className="revenue-bar">
                            <div className="revenue-bar-fill" style={{ width: `${item.percent}%` }}></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'customers' && (
              <div className="customers-tab">
                <div className="charts-row">
                  <div className="chart-card">
                    <div className="chart-header">
                      <h3 className="chart-title">Booking Patterns by Time</h3>
                      <p className="chart-description">Peak booking hours analysis</p>
                    </div>
                    <div className="chart-placeholder">
                      <ResponsiveContainer width="100%" height={224}>
                        <BarChart data={analytics?.bookingTime ?? BOOKING_TIME_DATA}>
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
                  <div className="chart-card">
                    <div className="chart-header">
                      <h3 className="chart-title">Geographic Distribution</h3>
                      <p className="chart-description">Bookings by location</p>
                    </div>
                    <div className="geographic-list">
                      {[
                        { location: 'Doha', bookings: '145 bookings', percent: '45.2%', color: '#6366f1' },
                        { location: 'Al Rayyan', bookings: '98 bookings', percent: '30.5%', color: '#8b5cf6' },
                        { location: 'Al Wakrah', bookings: '42 bookings', percent: '13.1%', color: '#a78bfa' },
                        { location: 'Umm Salal', bookings: '25 bookings', percent: '7.8%', color: '#c4b5fd' },
                        { location: 'Others', bookings: '11 bookings', percent: '3.4%', color: '#ddd6fe' },
                      ].map((item) => (
                        <div key={item.location} className="geographic-item">
                          <div className="geographic-info">
                            <div className="geographic-dot" style={{ backgroundColor: item.color }}></div>
                            <span className="geographic-location">{item.location}</span>
                          </div>
                          <div className="geographic-stats">
                            <span className="geographic-bookings">{item.bookings}</span>
                            <span className="geographic-percent">{item.percent}</span>
                          </div>
                        </div>
                      ))}
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
                        <BarChart data={analytics?.utilization ?? UTILIZATION_DATA}>
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
                      {[
                        { vehicle: 'BMW X3 2024', service: 'Oil Change', date: 'Dec 28', status: 'pending' },
                        { vehicle: 'Mercedes C-Class', service: 'Tire Rotation', date: 'Dec 30', status: 'pending' },
                        { vehicle: 'Audi A4 2023', service: 'Brake Service', date: 'Jan 2', status: 'scheduled' },
                        { vehicle: 'Toyota Camry', service: 'General Service', date: 'Jan 5', status: 'scheduled' },
                      ].map((item, i) => (
                        <div key={i} className="maintenance-item">
                          <div className="maintenance-info">
                            <div className="maintenance-vehicle">{item.vehicle}</div>
                            <div className="maintenance-service">{item.service}</div>
                          </div>
                          <div className="maintenance-date-info">
                            <div className="maintenance-date">{item.date}</div>
                            <div className={`maintenance-status ${item.status}`}>{item.status}</div>
                          </div>
                        </div>
                      ))}
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
                    <h3 className="insights-main-title">AI-Powered Insights & Recommendations</h3>
                  </div>
                  <p className="insights-subtitle">Smart analytics to optimize your business</p>
                </div>
                <div className="insights-grid">
                  {[
                    { 
                      title: 'Peak Demand Prediction', 
                      badge: 'opportunity',
                      description: 'Weekend demand expected to increase by 25% next week',
                      action: 'Consider increasing weekend pricing by 10-15%',
                      impact: 'Potential +QAR 3,200 revenue'
                    },
                    { 
                      title: 'Fleet Optimization', 
                      badge: 'opportunity',
                      description: 'SUVs have 20% higher utilization than sedans',
                      action: 'Consider adding 2 more SUVs to your fleet',
                      impact: 'Estimated +QAR 5,000 monthly revenue'
                    },
                    { 
                      title: 'Customer Retention', 
                      badge: 'warning',
                      description: '15% of customers haven\'t returned in 3 months',
                      action: 'Launch re-engagement campaign with 10% discount',
                      impact: 'Potential to recover 40+ customers'
                    },
                    { 
                      title: 'Pricing Strategy', 
                      badge: 'opportunity',
                      description: 'Your average daily rate is 12% below market',
                      action: 'Gradual price increase of QAR 20-30 per day',
                      impact: 'Estimated +QAR 8,000 monthly revenue'
                    },
                  ].map((insight, i) => (
                    <div key={i} className="insight-card">
                      <div className="insight-header">
                        <h4 className="insight-title">{insight.title}</h4>
                        <span className={`insight-badge ${insight.badge}`}>{insight.badge}</span>
                      </div>
                      <p className="insight-description">{insight.description}</p>
                      <div className="insight-actions">
                        <div className="insight-action-label">Recommended Action:</div>
                        <div className="insight-action">{insight.action}</div>
                        <div className="insight-impact">{insight.impact}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
