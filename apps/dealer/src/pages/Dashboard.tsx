import { useMemo, memo, useEffect, useState } from 'react'
import type { DealerDashboardData } from '../services/dealerService'
import { getDealerDashboard } from '../services/dealerService'
import { Sidebar } from '../components/Sidebar'
import { Header } from '../components/Header'
import { CalendarDays, Car, DollarSign, Users } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './Dashboard.css'

// Move constants outside component to prevent recreation
const REVENUE_DATA = [
  { month: 'Jan', revenue: 32000 },
  { month: 'Feb', revenue: 35000 },
  { month: 'Mar', revenue: 34000 },
  { month: 'Apr', revenue: 39000 },
  { month: 'May', revenue: 41000 },
  { month: 'Jun', revenue: 42000 },
] as const

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

  useEffect(() => {
    getDealerDashboard().then(setDashboard)
  }, [])

  // Memoize tooltip formatter to prevent recreation
  const formatTooltip = useMemo(() => {
    return (value: number) => [`QAR ${value.toLocaleString()}`, 'Revenue'] as const
  }, [])

  const kpis = useMemo(() => {
    const map = new Map(dashboard?.kpis.map(kpi => [kpi.label, kpi.value]))
    return {
      revenue: map.get('Revenue') ?? 0,
      activeRentals: map.get('Active Rentals') ?? 0,
      availableVehicles: map.get('Available Vehicles') ?? 0,
      leads: map.get('Leads') ?? 0,
    }
  }, [dashboard])

  return (
    <div className="dashboard-page">
      <Sidebar />
      <Header />
      
      <div className="dashboard-content">
        <div className="page-header">
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, Dealer Account</p>
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-info">
              <div className="stat-label">Total Revenue</div>
              <div className="stat-value">QAR {kpis.revenue.toLocaleString('en-US')}</div>
              <div className="stat-change positive">+12.5%</div>
            </div>
            <div className="stat-icon"><DollarSign size={18} /></div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <div className="stat-label">Total Bookings</div>
              <div className="stat-value">{kpis.activeRentals}</div>
              <div className="stat-change positive">+8.2%</div>
            </div>
            <div className="stat-icon"><CalendarDays size={18} /></div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <div className="stat-label">Active Vehicles</div>
              <div className="stat-value">{kpis.availableVehicles}</div>
              <div className="stat-change neutral">No change</div>
            </div>
            <div className="stat-icon"><Car size={18} /></div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <div className="stat-label">Total Customers</div>
              <div className="stat-value">{kpis.leads}</div>
              <div className="stat-change positive">+15.3%</div>
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
              <LineChart data={REVENUE_DATA} margin={chartConfig.margin}>
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
                  domain={[0, 60000]}
                  ticks={[0, 15000, 30000, 45000, 60000]}
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
            <div className="bookings-list">
              <div className="booking-item">
                <div className="booking-info">
                  <div className="booking-name">Ahmed Al-Rashid</div>
                  <div className="booking-details">BMW X3 • Today, 2:30 PM</div>
                </div>
                <div className="booking-badge confirmed">Confirmed</div>
              </div>
              <div className="booking-item">
                <div className="booking-info">
                  <div className="booking-name">Sarah Mitchell</div>
                  <div className="booking-details">Mercedes C-Class • Yesterday, 4:15 PM</div>
                </div>
                <div className="booking-badge completed">Completed</div>
              </div>
              <div className="booking-item">
                <div className="booking-info">
                  <div className="booking-name">Mohammed Hassan</div>
                  <div className="booking-details">Audi A4 • Jan 18, 10:00 AM</div>
                </div>
                <div className="booking-badge active">Active</div>
              </div>
            </div>
          </div>

          <div className="vehicle-status-card">
            <h3 className="card-title">Vehicle Status</h3>
            <div className="vehicles-list">
              <div className="vehicle-item">
                <div className="vehicle-info">
                  <div className="status-dot available"></div>
                  <span className="vehicle-name">BMW X3 2024</span>
                </div>
                <div className="vehicle-badge">Available</div>
              </div>
              <div className="vehicle-item">
                <div className="vehicle-info">
                  <div className="status-dot rented"></div>
                  <span className="vehicle-name">Mercedes C-Class</span>
                </div>
                <div className="vehicle-badge">Rented</div>
              </div>
              <div className="vehicle-item">
                <div className="vehicle-info">
                  <div className="status-dot maintenance"></div>
                  <span className="vehicle-name">Audi A4 2023</span>
                </div>
                <div className="vehicle-badge">Maintenance</div>
              </div>
              <div className="vehicle-item">
                <div className="vehicle-info">
                  <div className="status-dot available"></div>
                  <span className="vehicle-name">Toyota Camry</span>
                </div>
                <div className="vehicle-badge">Available</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})
