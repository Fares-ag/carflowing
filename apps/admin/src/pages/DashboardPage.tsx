import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '@carflow/shared'
import {
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CalendarCheck, DollarSign, Users, Car } from 'lucide-react'
import type { AdminDashboardData } from '../services/adminService'
import { getAdminDashboard } from '../services/adminService'
import { getCurrentUser } from '../services/authService'
import { AdminLayout } from '../layout/AdminLayout'
import { InfoModal } from '../components/InfoModal'
import './DashboardPage.css'

export function DashboardPage() {
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null)
  const [userName, setUserName] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bookingQuery, setBookingQuery] = useState('')
  const [bookingStatusFilter, setBookingStatusFilter] = useState<'all' | 'Active' | 'Pending' | 'Completed' | 'Cancelled'>('all')
  const [showBookingSearch, setShowBookingSearch] = useState(false)
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)

  useEffect(() => {
    setIsLoading(true)
    setError(null)
    getAdminDashboard()
      .then(setDashboard)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load dashboard'))
      .finally(() => setIsLoading(false))
  }, [])
  useEffect(() => {
    getCurrentUser().then((u) => setUserName(u?.name ?? null))
  }, [])

  const kpis = useMemo(() => {
    const kpiMap = new Map(dashboard?.kpis.map(kpi => [kpi.label, kpi.value]))
    return {
      activeCustomers: kpiMap.get('Active Users') ?? 0,
      totalRevenue: kpiMap.get('Total Revenue') ?? 0,
      totalCars: kpiMap.get('Total Cars') ?? kpiMap.get('Total Vehicles') ?? 0,
      totalBookings: kpiMap.get('Total Rentals') ?? 0,
    }
  }, [dashboard])

  const bookingStatusData = useMemo(() => {
    const counts = dashboard?.bookingStatusCounts ?? { active: 0, reserved: 0, completed: 0, cancelled: 0 }
    return [
      { name: 'Active', value: Math.max(0, counts.active) },
      { name: 'Pending', value: Math.max(0, counts.reserved) },
      { name: 'Completed', value: Math.max(0, counts.completed) },
      { name: 'Cancelled', value: Math.max(0, counts.cancelled) },
    ].filter((d) => d.value > 0)
  }, [dashboard])

  const trendData = useMemo(() => {
    const rentalsTrend = dashboard?.rentalsTrend ?? []
    const revenueTrend = dashboard?.revenueTrend ?? []
    return rentalsTrend.map((point, index) => ({
      month: point.date,
      rentals: point.value,
      revenue: revenueTrend[index]?.value ?? 0,
    }))
  }, [dashboard])

  const recentBookings = useMemo(() => {
    const rentals = dashboard?.recentRentals ?? []
    return rentals.map((rental) => {
      const customerName = rental.customerName ?? 'Unknown customer'
      const vehicleName = rental.vehicleName ?? 'Unknown vehicle'
      const initials = customerName.slice(0, 2).toUpperCase() || '?'
      return {
        id: rental.id.slice(0, 8),
        customer: customerName,
        initials,
        vehicle: vehicleName,
        pickup: rental.startDate,
        ret: rental.endDate,
        location: '—',
        amount: formatCurrency(rental.totalAmount),
        status: rental.status === 'active' ? 'Active' : rental.status === 'reserved' ? 'Pending' : rental.status === 'completed' ? 'Completed' : 'Cancelled',
        tone: rental.status === 'active' ? 'blue' : rental.status === 'reserved' ? 'amber' : rental.status === 'completed' ? 'green' : 'red',
      }
    })
  }, [dashboard])

  const filteredBookings = useMemo(() => {
    let base = recentBookings
    if (bookingStatusFilter !== 'all') {
      base = base.filter(row => row.status === bookingStatusFilter)
    }
    if (!bookingQuery.trim()) return base
    const query = bookingQuery.toLowerCase()
    return base.filter(row =>
      [row.id, row.customer, row.vehicle, row.location].some(value => value.toLowerCase().includes(query))
    )
  }, [bookingQuery, bookingStatusFilter, recentBookings])

  const handleExportBookings = () => {
    const rows = filteredBookings.map(row => ({
      id: row.id,
      customer: row.customer,
      vehicle: row.vehicle,
      pickup: row.pickup,
      return: row.ret,
      location: row.location,
      amount: row.amount,
      status: row.status,
    }))
    const headers = Object.keys(rows[0] ?? {})
    const csv = [
      headers.join(','),
      ...rows.map(row => headers.map(header => `"${(row as Record<string, string>)[header] ?? ''}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', 'recent-bookings.csv')
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const cycleStatusFilter = () => {
    const options: Array<'all' | 'Active' | 'Pending' | 'Completed' | 'Cancelled'> = ['all', 'Active', 'Pending', 'Completed', 'Cancelled']
    const nextIndex = (options.indexOf(bookingStatusFilter) + 1) % options.length
    setBookingStatusFilter(options[nextIndex])
  }

  if (isLoading) {
    return (
      <AdminLayout title="Dashboard" subtitle="Overview of your Carflow platform">
        <div className="adminWelcome">
          <div className="adminWelcomeTitle">Loading...</div>
        </div>
      </AdminLayout>
    )
  }

  if (error) {
    return (
      <AdminLayout title="Dashboard" subtitle="Overview of your Carflow platform">
        <div className="adminWelcome">
          <div className="adminWelcomeTitle">Error</div>
          <div className="adminWelcomeSub">{error}</div>
        </div>
      </AdminLayout>
    )
  }

  return (
    <AdminLayout title="Dashboard" subtitle="Overview of your Carflow platform">
      <div className="adminWelcome">
        <div className="adminWelcomeTitle">Welcome back, {userName ?? 'Admin'}!</div>
        <div className="adminWelcomeSub">Here&apos;s what&apos;s happening with Carflow today.</div>
      </div>

      <section className="adminStats">
        <div className="adminStatCard">
          <div className="adminStatTop">
            <div className="adminStatIcon adminStatIcon--purple">
              <Users size={18} />
            </div>
          </div>
          <div className="adminStatLabel">Active Customers</div>
          <div className="adminStatValue">{kpis.activeCustomers.toLocaleString('en-US')}</div>
        </div>

        <div className="adminStatCard">
          <div className="adminStatTop">
            <div className="adminStatIcon adminStatIcon--blue">
              <DollarSign size={18} />
            </div>
          </div>
          <div className="adminStatLabel">Total Revenue</div>
          <div className="adminStatValue">{formatCurrency(kpis.totalRevenue)}</div>
        </div>

        <div className="adminStatCard">
          <div className="adminStatTop">
            <div className="adminStatIcon adminStatIcon--green">
              <Car size={18} />
            </div>
          </div>
          <div className="adminStatLabel">Active Dealers</div>
          <div className="adminStatValue">{dashboard?.kpis.find(k => k.label === 'Active Dealers')?.value ?? 0}</div>
        </div>

        <div className="adminStatCard">
          <div className="adminStatTop">
            <div className="adminStatIcon adminStatIcon--orange">
              <CalendarCheck size={18} />
            </div>
          </div>
          <div className="adminStatLabel">Total Bookings</div>
          <div className="adminStatValue">{kpis.totalBookings.toLocaleString('en-US')}</div>
        </div>
      </section>

      <section className="adminMidGrid">
        <div className="adminCard">
          <div className="adminCardHeader">
            <div>
              <div className="adminCardTitle">Booking Status</div>
              <div className="adminCardSub">All-time overview</div>
            </div>
          </div>

          <div className="adminDonutWrap">
            <div className="adminDonut">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={bookingStatusData.length > 0 ? bookingStatusData : [{ name: 'No data', value: 1 }]} dataKey="value" innerRadius={55} outerRadius={80}>
                    {(bookingStatusData.length > 0 ? bookingStatusData : [{ name: 'No data', value: 1 }]).map((_, index) => (
                      <Cell
                        key={`slice-${index}`}
                        fill={bookingStatusData.length > 0 ? ['#6366f1', '#22c55e', '#f59e0b', '#ef4444'][index % 4] : '#e5e7eb'}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="adminDonutCenter">
              <div className="adminDonutHint">Total</div>
              <div className="adminDonutValue">{bookingStatusData.reduce((sum, item) => sum + item.value, 0) || 0}</div>
              <div className="adminDonutDelta">{dashboard?.todayBookingsCount ?? 0} today</div>
            </div>
          </div>
        </div>

        <div className="adminCard adminCard--wide">
          <div className="adminCardHeader">
            <div>
              <div className="adminCardTitle">Rental Statistics</div>
              <div className="adminCardSub">Monthly performance overview</div>
            </div>
            <div className="adminLegendRow">
              <div className="adminLegend">
                <span className="adminLegendDot adminLegendDot--purple" aria-hidden="true" />
                Rentals
              </div>
              <div className="adminLegend">
                <span className="adminLegendDot adminLegendDot--dark" aria-hidden="true" />
                Revenue
              </div>
            </div>
          </div>

          <div className="adminChart">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="rentals" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="revenue" stroke="#1f2937" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="adminTableCard">
        <div className="adminTableHeader">
          <div>
            <div className="adminTableTitle">Recent Bookings</div>
            <div className="adminTableSub">
              <span className="adminLiveDot" aria-hidden="true" /> {dashboard?.todayBookingsCount ?? 0} new today
            </div>
          </div>
          <div className="adminTableActions">
            {showBookingSearch && (
              <label className="adminSelectBtn">
                <input
                  type="text"
                  placeholder="Search bookings..."
                  value={bookingQuery}
                  onChange={(event) => setBookingQuery(event.target.value)}
                />
              </label>
            )}
            <button className="adminPillBtn" type="button" onClick={() => setShowBookingSearch((prev) => !prev)}>
              {showBookingSearch ? 'Hide Search' : 'Search'}
            </button>
            <button className="adminPillBtn" type="button" onClick={cycleStatusFilter}>
              {bookingStatusFilter === 'all' ? 'Filter' : `Filter: ${bookingStatusFilter}`}
            </button>
            <button className="adminPillBtn adminPillBtn--primary" type="button" onClick={handleExportBookings}>
              Export
            </button>
          </div>
        </div>

        <div className="adminTableWrap">
          <table className="adminTable">
            <thead>
              <tr>
                <th>Booking ID</th>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Pickup Date</th>
                <th>Return Date</th>
                <th>Location</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredBookings.map((row) => (
                <tr key={row.id}>
                  <td className="adminTdStrong">{row.id}</td>
                  <td>
                    <div className="adminCustomerCell">
                      <span className="adminAvatar" aria-hidden="true">
                        {row.initials}
                      </span>
                      <span className="adminCustomerName">{row.customer}</span>
                    </div>
                  </td>
                  <td className="adminTdMuted">{row.vehicle}</td>
                  <td className="adminTdMuted">{row.pickup}</td>
                  <td className="adminTdMuted">{row.ret}</td>
                  <td className="adminTdMuted">{row.location}</td>
                  <td className="adminTdStrong">{row.amount}</td>
                  <td>
                    <span className={`adminBadge adminBadge--${row.tone}`}>{row.status}</span>
                  </td>
                  <td>
                    <button
                      className="adminKebab"
                      type="button"
                      aria-label="Row actions"
                      onClick={() =>
                        setInfoModal({
                          title: `Booking ${row.id}`,
                          message: `Customer: ${row.customer}\nStatus: ${row.status}`,
                        })
                      }
                    >
                      ⋯
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <InfoModal
        open={!!infoModal}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onClose={() => setInfoModal(null)}
      />
    </AdminLayout>
  )
}
