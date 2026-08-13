import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CustomerStats, CustomerWithStats } from '../services/adminService'
import { formatCurrency } from '@carflow/shared'
import { toast } from 'sonner'
import {
  getCustomerDetails,
  getCustomerStats,
  listCustomersWithStats,
  updateCustomerProfile,
  updateCustomerStatus,
  updateCustomerVerification,
} from '../services/adminService'
import { AdminLayout } from '../layout/AdminLayout'
import { InfoModal } from '../components/InfoModal'
import {
  Ban,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Download,
  Eye,
  Mail,
  Pencil,
  Phone,
  Search,
  UserCheck,
  UserRound,
  UserX,
  Users,
  X,
} from 'lucide-react'
import './CustomersPage.css'

const getInitials = (name: string) =>
  name
    .split(' ')
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

const downloadCsv = (filename: string, rows: Array<Record<string, string>>) => {
  const headers = Object.keys(rows[0] ?? {})
  const csv = [
    headers.join(','),
    ...rows.map(row => headers.map(header => `"${row[header] ?? ''}"`).join(',')),
  ].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithStats[]>([])
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [statusConfirmUser, setStatusConfirmUser] = useState<typeof customerRows[0] | null>(null)
  const [viewCustomer, setViewCustomer] = useState<CustomerWithStats | null>(null)
  const [editCustomer, setEditCustomer] = useState<CustomerWithStats | null>(null)
  const [editForm, setEditForm] = useState({ name: '', phone: '', verification: 'verified' as 'verified' | 'unverified' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customerStatsData, setCustomerStatsData] = useState<CustomerStats | null>(null)

  const refresh = useCallback(() => {
    listCustomersWithStats({ page, pageSize })
      .then((data) => {
        setCustomers(data.items)
        setTotal(data.total)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load customers'))
  }, [page, pageSize])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    getCustomerStats()
      .then(setCustomerStatsData)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load customer stats'))
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const customerRows = useMemo(() => {
    return customers.map((c) => ({
      ...c,
      id: c.id,
      displayId: `C-${c.id.slice(0, 8)}`,
      initials: getInitials(c.name),
      joinDate: new Date(c.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
      }),
      rentals: String(c.rentalsCount),
      spent: formatCurrency(c.totalSpent),
      verification: c.verification,
      status: c.accountStatus,
    }))
  }, [customers])

  const filteredRows = useMemo(() => {
    const normalizedStatus = statusFilter.toLowerCase()
    const base = normalizedStatus === 'all'
      ? customerRows
      : customerRows.filter(row => row.status?.toLowerCase() === normalizedStatus)
    if (!searchQuery.trim()) return base
    const query = searchQuery.toLowerCase()
    return base.filter(row =>
      [row.name, row.email].some(value => value?.toLowerCase().includes(query))
    )
  }, [customerRows, searchQuery, statusFilter])

  const stats = useMemo(() => {
    return [
      { label: 'Total Customers', value: String(customerStatsData?.total ?? total), icon: <Users size={18} />, tone: 'dark' },
      { label: 'Active', value: String(customerStatsData?.active ?? 0), icon: <UserRound size={18} />, tone: 'green' },
      { label: 'Suspended', value: String(customerStatsData?.suspended ?? 0), icon: <UserX size={18} />, tone: 'red' },
      { label: 'New This Month', value: String(customerStatsData?.newThisMonth ?? 0), icon: <CheckCircle2 size={18} />, tone: 'blue' },
    ] as const
  }, [customerStatsData, total])

  const handleView = useCallback((user: typeof customerRows[0]) => {
    getCustomerDetails(user.id)
      .then((detail) => {
        if (detail) setViewCustomer(detail)
        else setInfoModal({ title: 'Error', message: 'Customer not found' })
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load customer details'))
  }, [])

  const handleEdit = useCallback((user: typeof customerRows[0]) => {
    setEditCustomer(user)
    setEditForm({
      name: user.name,
      phone: user.phone ?? '',
      verification: user.verification,
    })
    setError(null)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editCustomer) return
    setSaving(true)
    setError(null)
    try {
      await updateCustomerProfile(editCustomer.id, { name: editForm.name, phone: editForm.phone || undefined })
      await updateCustomerVerification(editCustomer.id, editForm.verification)
      refresh()
      setEditCustomer(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setSaving(false)
    }
  }, [editCustomer, editForm, refresh])

  const handleToggleStatus = useCallback((user: typeof customerRows[0]) => {
    setStatusConfirmUser(user)
  }, [])

  const confirmToggleStatus = useCallback(async () => {
    if (!statusConfirmUser) return
    const newStatus = statusConfirmUser.status === 'active' ? 'suspended' : 'active'
    try {
      await updateCustomerStatus(statusConfirmUser.id, newStatus)
      setStatusConfirmUser(null)
      refresh()
    } catch (e) {
      setInfoModal({
        title: 'Error',
        message: e instanceof Error ? e.message : 'Failed to update status',
      })
    }
  }, [refresh, statusConfirmUser])

  return (
    <AdminLayout title="Customers" subtitle="Customer database and management">
      <div className="customersPage">
        <div className="customersStats">
          {stats.map((stat) => (
            <div key={stat.label} className="customersStatCard">
              <div>
                <div className="customersStatLabel">{stat.label}</div>
                <div className={`customersStatValue customersStatValue--${stat.tone}`}>{stat.value}</div>
              </div>
              {stat.icon}
            </div>
          ))}
        </div>

        <div className="customersControls">
          <div className="customersControlsHeader">
            <div className="customersControlsTitle">User Management</div>
            <div className="customersControlsSub">Manage and monitor all registered users</div>
          </div>
          <div className="customersControlsRow">
            <div className="customersSearch">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <label className="customersSelect">
              <select
                aria-label="Filter users by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">All Users</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
              <ChevronDown size={14} />
            </label>
            <button
              className="customersExport"
              type="button"
              onClick={() => {
                downloadCsv(
                  'customers.csv',
                  filteredRows.map(row => ({
                    id: row.displayId,
                    name: row.name,
                    email: row.email,
                    phone: row.phone ?? '',
                    joinDate: row.joinDate,
                    status: row.status ?? 'active',
                    rentals: row.rentals,
                    spent: row.spent,
                  }))
                )
              }}
            >
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        <div className="customersTableCard">
          <table className="customersTable">
            <thead>
              <tr>
                <th>User</th>
                <th>Contact</th>
                <th>Join Date</th>
                <th>Total Rentals</th>
                <th>Total Spent</th>
                <th>Verification</th>
                <th>Status</th>
                <th className="customersTableActions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="customersUser">
                      <span className="customersAvatar">{row.initials}</span>
                      <div>
                        <div className="customersUserName">{row.name}</div>
                        <div className="customersUserId">{row.displayId}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="customersContact">
                      <div>
                        <Mail size={14} />
                        {row.email}
                      </div>
                      <div>
                        <Phone size={14} />
                        {row.phone ?? '—'}
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="customersJoinDate">
                      <Calendar size={14} />
                      {row.joinDate}
                    </div>
                  </td>
                  <td>{row.rentals}</td>
                  <td>{row.spent}</td>
                  <td>
                    <span className={`customersBadge customersBadge--${row.verification}`}>
                      {row.verification === 'verified' ? <CheckCircle2 size={14} /> : <UserX size={14} />}
                      {row.verification === 'verified' ? 'Verified' : 'Unverified'}
                    </span>
                  </td>
                  <td>
                    <span className={`customersStatus customersStatus--${row.status}`}>
                      {row.status === 'active' ? 'Active' : 'Suspended'}
                    </span>
                  </td>
                  <td className="customersRowActions">
                    <button
                      className="customersIconButton"
                      type="button"
                      onClick={() => handleView(row)}
                      title="View details"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      className="customersIconButton"
                      type="button"
                      onClick={() => handleEdit(row)}
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      className="customersIconButton"
                      type="button"
                      onClick={() => handleToggleStatus(row)}
                      title={row.status === 'active' ? 'Suspend' : 'Activate'}
                    >
                      {row.status === 'active' ? (
                        <Ban size={16} />
                      ) : (
                        <UserCheck size={16} />
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="customersPagination" role="navigation" aria-label="Customer list pages">
            <button
              type="button"
              className="customersPaginationBtn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="customersPaginationStatus">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className="customersPaginationBtn"
              disabled={total === 0 || page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {/* View modal */}
      {viewCustomer && (
        <div className="adminInfoModalOverlay" role="dialog" aria-modal="true" aria-labelledby="view-customer-title">
          <div className="adminInfoModal customersDetailModal">
            <button
              className="adminInfoModalClose"
              type="button"
              onClick={() => setViewCustomer(null)}
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <h3 id="view-customer-title" className="adminInfoModalTitle">
              {viewCustomer.name}
            </h3>
            <div className="customersDetailContent">
              <p><strong>Email:</strong> {viewCustomer.email}</p>
              <p><strong>Phone:</strong> {viewCustomer.phone ?? '—'}</p>
              <p><strong>Account Status:</strong> {viewCustomer.accountStatus}</p>
              <p><strong>Verification:</strong> {viewCustomer.verification}</p>
              <p><strong>Total Rentals:</strong> {viewCustomer.rentalsCount}</p>
              <p><strong>Total Spent:</strong> {formatCurrency(viewCustomer.totalSpent)}</p>
              <p><strong>Joined:</strong> {new Date(viewCustomer.createdAt).toLocaleDateString()}</p>
            </div>
            <div className="adminInfoModalActions">
              <button className="adminInfoModalBtn" type="button" onClick={() => setViewCustomer(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editCustomer && (
        <div className="adminInfoModalOverlay" role="dialog" aria-modal="true" aria-labelledby="edit-customer-title">
          <div className="adminInfoModal customersEditModal">
            <button
              className="adminInfoModalClose"
              type="button"
              onClick={() => setEditCustomer(null)}
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <h3 id="edit-customer-title" className="adminInfoModalTitle">
              Edit {editCustomer.name}
            </h3>
            <div className="customersEditForm">
              <label>
                Name
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                />
              </label>
              <label>
                Phone
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </label>
              <label>
                Verification
                <select
                  value={editForm.verification}
                  onChange={(e) => setEditForm((f) => ({ ...f, verification: e.target.value as 'verified' | 'unverified' }))}
                >
                  <option value="verified">Verified</option>
                  <option value="unverified">Unverified</option>
                </select>
              </label>
              {error && <p className="customersEditError">{error}</p>}
            </div>
            <div className="adminInfoModalActions">
              <button className="adminInfoModalBtn" type="button" onClick={() => setEditCustomer(null)}>
                Cancel
              </button>
              <button
                className="adminInfoModalBtn adminInfoModalBtn--primary"
                type="button"
                onClick={handleSaveEdit}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
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
      <InfoModal
        open={!!statusConfirmUser}
        title={statusConfirmUser?.status === 'active' ? 'Suspend customer?' : 'Activate customer?'}
        message={
          statusConfirmUser
            ? `${statusConfirmUser.status === 'active' ? 'Suspend' : 'Activate'} ${statusConfirmUser.name}?`
            : ''
        }
        onClose={() => setStatusConfirmUser(null)}
        onConfirm={() => void confirmToggleStatus()}
        confirmLabel={statusConfirmUser?.status === 'active' ? 'Suspend' : 'Activate'}
      />
    </AdminLayout>
  )
}
