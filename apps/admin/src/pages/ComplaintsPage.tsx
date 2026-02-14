import { useEffect, useMemo, useState } from 'react'
import type { Complaint } from '@carflow/shared'
import { listComplaints, updateComplaintStatus } from '../services/adminService'
import { AdminLayout } from '../layout/AdminLayout'
import {
  BadgeAlert,
  BadgeCheck,
  BellRing,
  ChevronDown,
  Filter,
  Search,
  UserRound,
  Users,
} from 'lucide-react'
import {
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
import './ComplaintsPage.css'

const CATEGORY_LEGEND = [
  { label: 'Customer-Dealer', value: '24', color: '#ef4444' },
  { label: 'Website', value: '18', color: '#f59e0b' },
  { label: 'Plans', value: '12', color: '#685ff7' },
  { label: 'Payments', value: '22', color: '#10b981' },
  { label: 'Car Quality', value: '15', color: '#3b82f6' },
  { label: 'Technical', value: '9', color: '#8b5cf6' }
] as const

export function ComplaintsPage() {
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')

  const refreshComplaints = () => {
    listComplaints({ pageSize: 20 }).then((data) => setComplaints(data.items))
  }

  useEffect(() => {
    refreshComplaints()
  }, [])

  const complaintRows = useMemo(() => {
    return complaints.map((complaint, index) => {
      const isDealer = index % 3 === 0
      const name = isDealer ? `Dealer ${index + 1}` : `Customer ${index + 1}`
      const initials = name
        .split(' ')
        .map(part => part[0])
        .join('')
        .slice(0, 2)

      return {
        id: `CMP-2025-${String(index + 1).padStart(3, '0')}`,
        sourceId: complaint.id,
        initials,
        name,
        email: `${name.toLowerCase().replace(' ', '.')}@email.com`,
        type: isDealer ? 'dealer' : 'customer',
        category: complaint.category,
        subject: complaint.subject,
        priority: complaint.priority,
        status: complaint.status.replace('_', ' '),
      }
    })
  }, [complaints])

  const filteredRows = useMemo(() => {
    const normalizedStatus = statusFilter.toLowerCase()
    const normalizedPriority = priorityFilter.toLowerCase()
    const normalizedCategory = categoryFilter.toLowerCase()
    const base = complaintRows.filter(row => {
      const statusOk = normalizedStatus === 'all' || row.status.toLowerCase() === normalizedStatus
      const priorityOk = normalizedPriority === 'all' || row.priority.toLowerCase() === normalizedPriority
      const categoryOk = normalizedCategory === 'all' || row.category.toLowerCase() === normalizedCategory
      return statusOk && priorityOk && categoryOk
    })
    if (!searchQuery.trim()) return base
    const query = searchQuery.toLowerCase()
    return base.filter(row =>
      [row.name, row.email, row.category, row.subject].some(value => value.toLowerCase().includes(query))
    )
  }, [complaintRows, searchQuery, statusFilter, priorityFilter, categoryFilter])

  const statusOptions = useMemo(() => {
    const values = Array.from(new Set(complaintRows.map(row => row.status)))
    return ['all', ...values]
  }, [complaintRows])

  const priorityOptions = useMemo(() => {
    const values = Array.from(new Set(complaintRows.map(row => row.priority)))
    return ['all', ...values]
  }, [complaintRows])

  const categoryOptions = useMemo(() => {
    const values = Array.from(new Set(complaintRows.map(row => row.category)))
    return ['all', ...values]
  }, [complaintRows])

  const stats = useMemo(() => {
    const total = filteredRows.length
    const pending = filteredRows.filter(row => row.status === 'open' || row.status === 'pending').length
    const inProgress = filteredRows.filter(row => row.status === 'in progress').length
    const resolved = filteredRows.filter(row => row.status === 'resolved').length
    const urgent = filteredRows.filter(row => row.priority === 'urgent').length

    return [
      { label: 'Total', value: String(total), icon: <Users size={18} />, tone: 'blue' },
      { label: 'Pending', value: String(pending), icon: <BellRing size={18} />, tone: 'amber' },
      { label: 'In Progress', value: String(inProgress), icon: <BadgeAlert size={18} />, tone: 'purple' },
      { label: 'Resolved', value: String(resolved), icon: <BadgeCheck size={18} />, tone: 'green' },
      { label: 'Urgent', value: String(urgent), icon: <BadgeAlert size={18} />, tone: 'red' },
    ] as const
  }, [filteredRows])

  const categoryData = useMemo(
    () => CATEGORY_LEGEND.map(item => ({ name: item.label, value: Number(item.value) })),
    []
  )

  const trendData = useMemo(
    () => [
      { month: 'Aug', value: 12 },
      { month: 'Sep', value: 18 },
      { month: 'Oct', value: 26 },
      { month: 'Nov', value: 21 },
      { month: 'Dec', value: 29 },
      { month: 'Jan', value: 24 },
    ],
    []
  )

  return (
    <AdminLayout title="Complaints" subtitle="Customer and dealer complaints">
      <div className="complaintsPage">
        <div className="complaintsHeader">
          <div>
            <h2>Complaints Management</h2>
            <p>Monitor and resolve customer and dealer complaints</p>
          </div>
        </div>

        <div className="complaintsStats">
          {stats.map((stat) => (
            <div key={stat.label} className="complaintsStatCard">
              <div className={`complaintsStatIcon complaintsStatIcon--${stat.tone}`}>
                {stat.icon}
              </div>
              <div className="complaintsStatLabel">{stat.label}</div>
              <div className="complaintsStatValue">{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="complaintsCharts">
          <div className="complaintsCard">
            <div className="complaintsCardTitle">
              <BadgeAlert size={16} />
              Complaints by Category
            </div>
            <div className="complaintsChartWrap">
              <div className="complaintsDonut">
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={categoryData} dataKey="value" innerRadius={60} outerRadius={90}>
                      {categoryData.map((entry, index) => (
                        <Cell key={entry.name} fill={CATEGORY_LEGEND[index]?.color ?? '#6b7280'} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="complaintsLegend">
              {CATEGORY_LEGEND.map((item) => (
                <div key={item.label} className="complaintsLegendItem">
                  <span className="complaintsLegendDot" style={{ backgroundColor: item.color }} />
                  <span className="complaintsLegendLabel">{item.label}</span>
                  <span className="complaintsLegendValue">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="complaintsCard">
            <div className="complaintsCardTitle">
              <BadgeAlert size={16} />
              Monthly Trend
            </div>
            <div className="complaintsTrendWrap">
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData}>
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="complaintsFilterCard">
          <div className="complaintsCardTitle">
            <Filter size={16} />
            Filter Complaints
          </div>
          <div className="complaintsFilters">
            <div className="complaintsSearch">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <label className="complaintsSelect">
              <select
                aria-label="Filter by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {statusOptions.map(option => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'All Status' : option}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="complaintsSelect">
              <select
                aria-label="Filter by priority"
                value={priorityFilter}
                onChange={(event) => setPriorityFilter(event.target.value)}
              >
                {priorityOptions.map(option => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'All Priority' : option}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
            <label className="complaintsSelect">
              <select
                aria-label="Filter by category"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                {categoryOptions.map(option => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'All Categories' : option}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </label>
          </div>
        </div>

        <div className="complaintsListCard">
          <div className="complaintsListHeader">
            <div>
              <div className="complaintsListTitle">Complaints List</div>
              <div className="complaintsListSub">
                Click on any complaint to view details ({complaintRows.length} results)
              </div>
            </div>
          </div>

          <div className="complaintsTableWrap">
            <table className="complaintsTable">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>User</th>
                  <th>Type</th>
                  <th>Category</th>
                  <th>Subject</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>
                      <div className="complaintsUser">
                        <span className="complaintsAvatar">{row.initials}</span>
                        <div>
                          <div className="complaintsUserName">{row.name}</div>
                          <div className="complaintsUserEmail">{row.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="complaintsType">
                        {row.type === 'dealer' ? <UserRound size={14} /> : <Users size={14} />}
                        {row.type}
                      </span>
                    </td>
                    <td>{row.category}</td>
                    <td className="complaintsSubject">{row.subject}</td>
                    <td>
                      <span className={`complaintsBadge complaintsBadge--${row.priority}`}>{row.priority}</span>
                    </td>
                    <td>
                      <span className={`complaintsBadge complaintsBadge--${row.status.replace(' ', '-')}`}>{row.status}</span>
                    </td>
                    <td>
                      <button
                        className="complaintsActionBtn"
                        type="button"
                        onClick={() => {
                          const nextStatus =
                            row.status === 'open'
                              ? 'in_progress'
                              : row.status === 'in progress'
                              ? 'resolved'
                              : 'open'
                          updateComplaintStatus(row.sourceId, nextStatus).then(() => refreshComplaints())
                        }}
                      >
                        <BadgeCheck size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminLayout>
  )
}
