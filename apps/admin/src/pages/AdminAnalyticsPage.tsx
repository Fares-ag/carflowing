import { useEffect, useMemo, useState } from 'react'
import { formatCurrency } from '@carflow/shared'
import type { AdminAnalyticsData } from '../services/adminService'
import { getAdminAnalytics } from '../services/adminService'
import { AdminLayout } from '../layout/AdminLayout'
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
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  Car,
  Clock,
  TrendingUp,
  Users,
} from 'lucide-react'
import './AdminAnalyticsPage.css'

export function AdminAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AdminAnalyticsData | null>(null)

  useEffect(() => {
    getAdminAnalytics().then(setAnalytics)
  }, [])

  const stats = useMemo(() => {
    const kpiMap = new Map(analytics?.kpis.map(kpi => [kpi.label, kpi]))
    const revenue = kpiMap.get('Total Revenue')
    const rentals = kpiMap.get('Total Rentals')
    const duration = kpiMap.get('Avg Duration')
    const growth = kpiMap.get('Customer Growth')

    return [
      {
        label: 'Total Revenue',
        value: revenue ? formatCurrency(revenue.value) : 'QAR 0',
        change: revenue ? `${revenue.changePct ?? 0}%` : '0%',
        icon: <BadgeDollarSign size={18} />,
        changeIcon: <ArrowUpRight size={14} />,
        changeTone: revenue && (revenue.changePct ?? 0) < 0 ? 'down' : 'up',
      },
      {
        label: 'Total Rentals',
        value: rentals ? rentals.value.toLocaleString('en-US') : '0',
        change: rentals ? `${rentals.changePct ?? 0}%` : '0%',
        icon: <Car size={18} />,
        changeIcon: <ArrowUpRight size={14} />,
        changeTone: rentals && (rentals.changePct ?? 0) < 0 ? 'down' : 'up',
      },
      {
        label: 'Avg. Rental Duration',
        value: duration ? `${duration.value.toFixed(1)} days` : '0.0 days',
        change: duration ? `${duration.changePct ?? 0}%` : '0%',
        icon: <Clock size={18} />,
        changeIcon: <ArrowDownRight size={14} />,
        changeTone: duration && (duration.changePct ?? 0) < 0 ? 'down' : 'up',
      },
      {
        label: 'Customer Growth',
        value: growth ? `${growth.value.toFixed(1)}%` : '0%',
        change: growth ? `${growth.changePct ?? 0}%` : '0%',
        icon: <Users size={18} />,
        changeIcon: <ArrowUpRight size={14} />,
        changeTone: growth && (growth.changePct ?? 0) < 0 ? 'down' : 'up',
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

  return (
    <AdminLayout title="Analytics" subtitle="Platform analytics and insights">
      <div className="adminAnalyticsPage">
        <div className="adminAnalyticsStats">
          {stats.map((stat) => (
            <div key={stat.label} className="adminAnalyticsStatCard">
              <div className="adminAnalyticsStatHeader">
                <span>{stat.label}</span>
                {stat.icon}
              </div>
              <div className="adminAnalyticsStatValue">{stat.value}</div>
              <div className="adminAnalyticsStatChange">
                {stat.changeIcon}
                <span className={stat.changeTone === 'down' ? 'is-down' : 'is-up'}>{stat.change}</span>
                <span className="adminAnalyticsStatSub">vs last month</span>
              </div>
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
                    {item.category}: {item.value}%
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
                  <div className="adminAnalyticsHighlightValue is-purple">October</div>
                  <div className="adminAnalyticsHighlightSub">Highest revenue month</div>
                </div>
                <TrendingUp size={20} />
              </div>
            </div>
            <div className="adminAnalyticsHighlightCard">
              <div className="adminAnalyticsHighlightTitle">Most Popular</div>
              <div className="adminAnalyticsHighlightBody">
                <div>
                  <div className="adminAnalyticsHighlightValue is-green">Sedan</div>
                  <div className="adminAnalyticsHighlightSub">35% of all rentals</div>
                </div>
                <Car size={20} />
              </div>
            </div>
            <div className="adminAnalyticsHighlightCard">
              <div className="adminAnalyticsHighlightTitle">Avg. Booking Value</div>
              <div className="adminAnalyticsHighlightBody">
                <div>
                  <div className="adminAnalyticsHighlightValue is-blue">QAR 2,340</div>
                  <div className="adminAnalyticsHighlightSub">Per rental transaction</div>
                </div>
                <BadgeDollarSign size={20} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
