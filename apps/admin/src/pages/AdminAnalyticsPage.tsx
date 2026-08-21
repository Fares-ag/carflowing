import { formatCurrency } from '@carflow/shared'
import {
  BadgeDollarSign,
  Car,
  Clock,
  Gauge,
  Percent,
  TrendingDown,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AdminLayout } from '../layout/AdminLayout'
import type { AdminAnalyticsData, AnalyticsRollups } from '../services/adminService'
import { getAdminAnalytics, getAnalyticsRollups } from '../services/adminService'
import './AdminAnalyticsPage.css'

function monthKeyToLabel(key: string): string {
  const parts = key.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  if (!y || !m) return key
  return new Date(y, m - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export function AdminAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AdminAnalyticsData | null>(null)
  const [rollups, setRollups] = useState<AnalyticsRollups | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isError, setIsError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const load = useCallback(() => {
    setIsLoading(true)
    setIsError(false)
    setErrorMessage(null)
    Promise.all([getAdminAnalytics(), getAnalyticsRollups(30)])
      .then(([analyticsData, rollupData]) => {
        setAnalytics(analyticsData)
        setRollups(rollupData)
      })
      .catch((err) => {
        setIsError(true)
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load analytics')
      })
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const stats = useMemo(() => {
    const kpiMap = new Map(analytics?.kpis.map((kpi) => [kpi.label, kpi]))
    const revenue = kpiMap.get('Total Revenue')
    const rentals = kpiMap.get('Total Rentals')
    const activeRentals = kpiMap.get('Active Rentals')
    const vehicles = kpiMap.get('Vehicles')

    return [
      {
        label: 'Total Revenue',
        value: revenue ? formatCurrency(revenue.value) : 'QAR 0',
        icon: <BadgeDollarSign size={18} />,
      },
      {
        label: 'Total Rentals',
        value: rentals ? rentals.value.toLocaleString('en-US') : '0',
        icon: <Car size={18} />,
      },
      {
        label: 'Active Rentals',
        value: activeRentals ? activeRentals.value.toLocaleString('en-US') : '0',
        icon: <Clock size={18} />,
      },
      {
        label: 'Vehicles',
        value: vehicles ? vehicles.value.toLocaleString('en-US') : '0',
        icon: <Users size={18} />,
      },
    ] as const
  }, [analytics])

  const trendData = useMemo(() => {
    const revenue = analytics?.revenueTrend ?? []
    const rentals = analytics?.rentalsTrend ?? []
    return revenue.map((point, index) => ({
      month: point.date,
      revenue: point.value,
      rentals: rentals[index]?.value ?? 0,
    }))
  }, [analytics])

  const vehicleData = analytics?.topVehicles ?? []
  const categoryData = analytics?.categoryDistribution ?? []
  const categoryTotal = useMemo(
    () => categoryData.reduce((sum, item) => sum + item.value, 0),
    [categoryData]
  )

  const highlights = useMemo(() => {
    if (!analytics) {
      return {
        peakMonth: '—',
        peakSub: 'Load data to see insights',
        topCategory: '—',
        topCategorySub: '—',
        avgBooking: 'QAR 0',
        avgBookingSub: '—',
      }
    }
    const revenue = analytics.revenueTrend
    let peakMonth = '—'
    let peakSub = 'No revenue in this range yet'
    if (revenue.length > 0) {
      const best = revenue.reduce((a, b) => (a.value >= b.value ? a : b))
      peakMonth = monthKeyToLabel(best.date)
      peakSub = 'Highest revenue month in this range'
    }

    const cats = analytics.categoryDistribution
    let topCategory = '—'
    let topCategorySub = 'No vehicles in catalog yet'
    if (cats.length > 0) {
      const total = cats.reduce((s, c) => s + c.value, 0)
      const best = cats.reduce((a, b) => (a.value >= b.value ? a : b))
      const pct = total > 0 ? Math.round((best.value / total) * 100) : 0
      topCategory = best.category
      topCategorySub = `${pct}% of vehicles by category`
    }

    const kpiMap = new Map(analytics.kpis.map((kpi) => [kpi.label, kpi]))
    const totalRev = Number(kpiMap.get('Total Revenue')?.value ?? 0)
    const totalRentals = Number(kpiMap.get('Total Rentals')?.value ?? 0)
    const avg = totalRentals > 0 ? totalRev / totalRentals : 0
    return {
      peakMonth,
      peakSub,
      topCategory,
      topCategorySub,
      avgBooking: formatCurrency(avg),
      avgBookingSub: totalRentals > 0 ? 'Mean revenue per rental (all time)' : 'No rentals recorded yet',
    }
  }, [analytics])

  const lifecycleStats = useMemo(() => {
    const m = rollups?.metrics
    if (!m) {
      return [
        { label: 'Activation rate', value: '—', sub: 'Signups verified (30d)', icon: <Users size={18} /> },
        { label: 'Approval SLA', value: '—', sub: 'Avg hours to approve', icon: <Clock size={18} /> },
        { label: 'Payment success', value: '—', sub: 'Online payments completed', icon: <Percent size={18} /> },
        { label: 'Churn rate', value: '—', sub: 'Cancellations / activations', icon: <TrendingDown size={18} /> },
      ]
    }
    return [
      {
        label: 'Activation rate',
        value: `${m.activationRate.toFixed(1)}%`,
        sub: `${m.counts.emailVerified} verified / ${m.counts.signups} signups (30d)`,
        icon: <Users size={18} />,
      },
      {
        label: 'Approval SLA',
        value: `${m.approvalSlaHours.toFixed(1)}h`,
        sub: `${m.counts.bookingsApproved} approvals tracked`,
        icon: <Clock size={18} />,
      },
      {
        label: 'Payment success',
        value: `${m.paymentSuccessRate.toFixed(1)}%`,
        sub: `${m.counts.paymentsCompleted} ok / ${m.counts.paymentsCompleted + m.counts.paymentsFailed} attempts`,
        icon: <Gauge size={18} />,
      },
      {
        label: 'Churn rate',
        value: `${m.churnRate.toFixed(1)}%`,
        sub: `${m.counts.cancelRequested} cancels / ${m.counts.rentalsActivated} activations`,
        icon: <TrendingDown size={18} />,
      },
    ] as const
  }, [rollups])

  return (
    <AdminLayout title="Analytics" subtitle="Platform analytics and insights">
      <div className="adminAnalyticsPage">
        {isLoading ? (
          <div className="adminAnalyticsStatCard" role="status">
            <div className="adminAnalyticsCardTitle">Loading analytics…</div>
          </div>
        ) : isError ? (
          <div className="adminAnalyticsStatCard" role="alert">
            <div className="adminAnalyticsCardTitle">Could not load analytics.</div>
            {errorMessage ? <div className="adminAnalyticsCardSub">{errorMessage}</div> : null}
            <button type="button" className="adminAnalyticsCardSub" onClick={load}>
              Retry
            </button>
          </div>
        ) : (
          <>
        <div className="adminAnalyticsStats">
          {stats.map((stat) => (
            <div key={stat.label} className="adminAnalyticsStatCard">
              <div className="adminAnalyticsStatHeader">
                <span>{stat.label}</span>
                {stat.icon}
              </div>
              <div className="adminAnalyticsStatValue">{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="adminAnalyticsStats adminAnalyticsStats--lifecycle">
          {lifecycleStats.map((stat) => (
            <div key={stat.label} className="adminAnalyticsStatCard">
              <div className="adminAnalyticsStatHeader">
                <span>{stat.label}</span>
                {stat.icon}
              </div>
              <div className="adminAnalyticsStatValue">{stat.value}</div>
              <div className="adminAnalyticsCardSub">{stat.sub}</div>
            </div>
          ))}
        </div>

        <div className="adminAnalyticsCharts">
          <div className="adminAnalyticsCard">
            <div className="adminAnalyticsCardHeader">
              <div className="adminAnalyticsCardTitle">Revenue & Rentals Trend</div>
              <div className="adminAnalyticsCardSub">Monthly performance overview</div>
            </div>
            <div className="adminAnalyticsTrendChart">
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  <Line type="monotone" dataKey="rentals" stroke="#0f172a" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="adminAnalyticsTrendLegend">
              <div className="adminAnalyticsLegendItem">
                Rentals
              </div>
              <div className="adminAnalyticsLegendItem">
                Revenue (QAR)
              </div>
            </div>
          </div>

          <div className="adminAnalyticsSplit">
            <div className="adminAnalyticsCard">
              <div className="adminAnalyticsCardHeader">
                <div className="adminAnalyticsCardTitle">Top Performing Vehicles</div>
                <div className="adminAnalyticsCardSub">By number of rentals this month</div>
              </div>
              <div className="adminAnalyticsVehiclesChart">
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={vehicleData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="adminAnalyticsCard">
              <div className="adminAnalyticsCardHeader">
                <div className="adminAnalyticsCardTitle">Vehicle Category Distribution</div>
                <div className="adminAnalyticsCardSub">Breakdown by vehicle type</div>
              </div>
              <div className="adminAnalyticsCategoryChart">
                <div className="adminAnalyticsDonut">
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={categoryData} dataKey="value" nameKey="category" innerRadius={60} outerRadius={90}>
                        {categoryData.map((_, index) => (
                          <Cell
                            key={`slice-${index}`}
                            fill={['#8b5cf6', '#10b981', '#f59e0b', '#ef4444'][index % 4]}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="adminAnalyticsCategoryLegend">
                {categoryData.map((item, index) => (
                  <div key={item.category} className="adminAnalyticsLegendItem">
                    <span
                      className={`legendDot legendDot--${
                        index === 0 ? 'purple' : index === 1 ? 'green' : index === 2 ? 'amber' : 'red'
                      }`}
                    />
                    {item.category}:{' '}
                    {categoryTotal > 0 ? Math.round((item.value / categoryTotal) * 100) : 0}% ({item.value}{' '}
                    {item.value === 1 ? 'vehicle' : 'vehicles'})
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="adminAnalyticsHighlights">
            <div className="adminAnalyticsHighlightCard">
              <div className="adminAnalyticsHighlightTitle">Peak Season</div>
              <div className="adminAnalyticsHighlightBody">
                <div>
                  <div className="adminAnalyticsHighlightValue is-purple">{highlights.peakMonth}</div>
                  <div className="adminAnalyticsHighlightSub">{highlights.peakSub}</div>
                </div>
                <TrendingUp size={20} />
              </div>
            </div>
            <div className="adminAnalyticsHighlightCard">
              <div className="adminAnalyticsHighlightTitle">Largest category</div>
              <div className="adminAnalyticsHighlightBody">
                <div>
                  <div className="adminAnalyticsHighlightValue is-green">{highlights.topCategory}</div>
                  <div className="adminAnalyticsHighlightSub">{highlights.topCategorySub}</div>
                </div>
                <Car size={20} />
              </div>
            </div>
            <div className="adminAnalyticsHighlightCard">
              <div className="adminAnalyticsHighlightTitle">Avg. booking value</div>
              <div className="adminAnalyticsHighlightBody">
                <div>
                  <div className="adminAnalyticsHighlightValue is-blue">{highlights.avgBooking}</div>
                  <div className="adminAnalyticsHighlightSub">{highlights.avgBookingSub}</div>
                </div>
                <BadgeDollarSign size={20} />
              </div>
            </div>
          </div>
        </div>
          </>
        )}
      </div>
    </AdminLayout>
  )
}
