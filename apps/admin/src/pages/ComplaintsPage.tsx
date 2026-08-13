import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ComplaintWithCustomer } from '../services/adminService'
import { listComplaints, updateComplaintStatus } from '../services/adminService'
import { AdminLayout } from '../layout/AdminLayout'
import {
  BadgeAlert,
  BadgeCheck,
  BellRing,
  ChevronDown,
  Filter,
  Loader2,
  Search,
  Users,
  X,
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

const CHART_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#685ff7',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
]

function initialsFrom(name: string | null | undefined, email: string | null | undefined): string {
  const n = (name ?? '').trim()
  if (n) {
    return n
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }
  const e = (email ?? '').trim()
  if (e) return e.slice(0, 2).toUpperCase()
  return '?'
}

function complaintDisplayId(id: string): string {
  return `CMP-${id.replace(/-/g, '').slice(0, 10).toUpperCase()}`
}

function formatComplaintDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export function ComplaintsPage() {
  const [complaints, setComplaints] = useState<ComplaintWithCustomer[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedComplaintId, setSelectedComplaintId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const pageSize = 50

  const selectedComplaint = useMemo(
    () => complaints.find((c) => c.id === selectedComplaintId) ?? null,
    [complaints, selectedComplaintId]
  )

  const refreshComplaints = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const data = await listComplaints({ page, pageSize })
      setComplaints(data.items)
      setTotal(data.total)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load complaints')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refreshComplaints()
  }, [page])

  const complaintRows = useMemo(() => {
    return complaints.map((complaint) => {
      const name = complaint.customerName?.trim() || 'Unknown'
      const email = complaint.customerEmail?.trim() || '—'
      const initials = initialsFrom(complaint.customerName, complaint.customerEmail)

      return {
        id: complaint.id,
        displayId: complaintDisplayId(complaint.id),
        sourceId: complaint.id,
        initials,
        name,
        email,
        type: 'customer' as const,
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
      [row.name, row.email, row.category, row.subject, row.displayId].some(value =>
        value.toLowerCase().includes(query)
      )
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
    const pending = filteredRows.filter(row => row.status === 'open').length
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

  const categoryChartData = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of complaints) {
      const key = (c.category ?? '').trim() || 'Uncategorized'
      counts[key] = (counts[key] ?? 0) + 1
    }
    return Object.entries(counts)
      .map(([name, value], index) => ({
        name,
        value,
        color: CHART_COLORS[index % CHART_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value)
  }, [complaints])

  const categoryPieData = useMemo(
    () => categoryChartData.map(({ name, value }) => ({ name, value })),
    [categoryChartData]
  )

  const trendData = useMemo(() => {
    const months = 6
    const monthFmt = new Intl.DateTimeFormat('en', { month: 'short' })
    const now = new Date()
    const buckets: Array<{ month: string; sortKey: string; value: number }> = []
    for (let i = months - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      buckets.push({ month: monthFmt.format(d), sortKey, value: 0 })
    }
    for (const c of complaints) {
      const d = new Date(c.createdAt)
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const b = buckets.find((x) => x.sortKey === sortKey)
      if (b) b.value += 1
    }
    return buckets.map(({ month, value }) => ({ month, value }))
  }, [complaints])

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

        {loadError && (
          <div className="complaintsErrorBanner" role="alert">
            <span>{loadError}</span>
            <button type="button" className="complaintsRetryBtn" onClick={() => void refreshComplaints()}>
              Retry
            </button>
          </div>
        )}

        {loading ? (
          <div className="complaintsLoadingState">
            <Loader2 className="complaintsLoadingSpinner" size={32} aria-hidden />
            <p>Loading complaints…</p>
          </div>
        ) : (
          <>
        <div className="complaintsCharts">
          <div className="complaintsCard">
            <div className="complaintsCardTitle">
              <BadgeAlert size={16} />
              Complaints by Category
            </div>
            <div className="complaintsChartWrap">
              <div className="complaintsDonut">
                {categoryPieData.length === 0 ? (
                  <div className="complaintsChartEmpty">No complaints loaded yet.</div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={categoryPieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90}>
                        {categoryPieData.map((entry, index) => (
                          <Cell
                            key={entry.name}
                            fill={categoryChartData[index]?.color ?? '#6b7280'}
                          />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
            <div className="complaintsLegend">
              {categoryChartData.length === 0 ? (
                <div className="complaintsLegendEmpty">Categories will appear here once complaints exist.</div>
              ) : (
                categoryChartData.map((item) => (
                  <div key={item.name} className="complaintsLegendItem">
                    <span className="complaintsLegendDot" style={{ backgroundColor: item.color }} />
                    <span className="complaintsLegendLabel">{item.name}</span>
                    <span className="complaintsLegendValue">{item.value}</span>
                  </div>
                ))
              )}
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
                Click on any complaint to view details ({complaintRows.length} on this page
                {total > complaintRows.length ? ` · ${total} total` : ''})
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
                  <tr
                    key={row.id}
                    className="complaintsTableRow--clickable"
                    onClick={() => setSelectedComplaintId(row.id)}
                  >
                    <td>{row.displayId}</td>
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
                        <Users size={14} />
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
                        onClick={(e) => {
                          e.stopPropagation()
                          const nextStatus =
                            row.status === 'open'
                              ? 'in_progress'
                              : row.status === 'in progress'
                              ? 'resolved'
                              : 'open'
                          updateComplaintStatus(row.sourceId, nextStatus)
                            .then(() => void refreshComplaints())
                            .catch((err) =>
                              toast.error(err instanceof Error ? err.message : 'Failed to update status')
                            )
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
          {total > pageSize && (
            <div className="complaintsPagination">
              <button
                type="button"
                className="complaintsRetryBtn"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <span>
                Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
              </span>
              <button
                type="button"
                className="complaintsRetryBtn"
                disabled={page >= Math.ceil(total / pageSize) || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
          </>
        )}

        {selectedComplaint && (
          <div
            className="complaintsDetailOverlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="complaintsDetailTitle"
            onClick={() => setSelectedComplaintId(null)}
          >
            <div className="complaintsDetailModal" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="complaintsDetailClose"
                aria-label="Close"
                onClick={() => setSelectedComplaintId(null)}
              >
                <X size={18} />
              </button>
              <h3 id="complaintsDetailTitle" className="complaintsDetailTitle">
                Complaint details
              </h3>
              <dl className="complaintsDetailList">
                <div>
                  <dt>Complainant</dt>
                  <dd>{selectedComplaint.customerName?.trim() || 'Unknown'}</dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{selectedComplaint.customerEmail?.trim() || '—'}</dd>
                </div>
                <div>
                  <dt>Subject</dt>
                  <dd>{selectedComplaint.subject}</dd>
                </div>
                <div className="complaintsDetailFull">
                  <dt>Description</dt>
                  <dd>{selectedComplaint.description || '—'}</dd>
                </div>
                <div>
                  <dt>Priority</dt>
                  <dd>
                    <span className={`complaintsBadge complaintsBadge--${selectedComplaint.priority}`}>
                      {selectedComplaint.priority}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Status</dt>
                  <dd>
                    <span
                      className={`complaintsBadge complaintsBadge--${selectedComplaint.status.replace('_', '-')}`}
                    >
                      {selectedComplaint.status.replace('_', ' ')}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{formatComplaintDate(selectedComplaint.createdAt)}</dd>
                </div>
              </dl>
              <button
                type="button"
                className="complaintsDetailDone"
                onClick={() => setSelectedComplaintId(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
