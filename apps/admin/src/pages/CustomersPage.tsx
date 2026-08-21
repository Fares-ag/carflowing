import { formatCurrency, formatDate } from '@carflow/shared'
import {
  Ban,
  Calendar,
  CheckCircle2,
  Download,
  Eye,
  FileText,
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
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { CustomerDocumentViewer } from '../components/CustomerDocumentViewer'
import { InfoModal } from '../components/InfoModal'
import { AdminLayout } from '../layout/AdminLayout'
import type { CustomerStats, CustomerWithStats } from '../services/adminService'
import {
  getCustomerDetails,
  getCustomerStats,
  listCustomersWithStats,
  updateCustomerProfile,
  updateCustomerStatus,
  updateCustomerVerification,
} from '../services/adminService'
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
  const [editForm, setEditForm] = useState({ name: '', phone: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [customerStatsData, setCustomerStatsData] = useState<CustomerStats | null>(null)
  const [docViewer, setDocViewer] = useState<{ path: string; label: string } | null>(null)
  const [verificationReason, setVerificationReason] = useState('')
  const [verifying, setVerifying] = useState(false)

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
      joinDate: formatDate(c.createdAt),
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
    })
    setError(null)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!editCustomer) return
    setSaving(true)
    setError(null)
    try {
      await updateCustomerProfile(editCustomer.id, { name: editForm.name, phone: editForm.phone || undefined })
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

  const handleVerificationDecision = useCallback(
    async (decision: 'approve' | 'reject') => {
      if (!viewCustomer) return
      setVerifying(true)
      try {
        const status = decision === 'approve' ? 'verified' : 'unverified'
        const reason = verificationReason.trim()
        await updateCustomerVerification(viewCustomer.id, status, {
          decision,
          ...(reason ? { reason } : {}),
        })
        toast.success(decision === 'approve' ? 'Customer KYC approved' : 'Customer KYC rejected')
        refresh()
        const detail = await getCustomerDetails(viewCustomer.id)
        if (detail) setViewCustomer(detail)
        setVerificationReason('')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to update verification')
      } finally {
        setVerifying(false)
      }
    },
    [refresh, verificationReason, viewCustomer]
  )

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
          <div className="adminInfoModal customersDetailModal customersDetailModal--wide">
            <button
              className="adminInfoModalClose"
              type="button"
              onClick={() => {
                setViewCustomer(null)
                setVerificationReason('')
              }}
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
              <p>
                <strong>Verification:</strong>{' '}
                <span className={`customersBadge customersBadge--${viewCustomer.verification}`}>
                  {viewCustomer.verification === 'verified' ? 'Verified' : 'Unverified'}
                </span>
              </p>
              <p><strong>Total Rentals:</strong> {viewCustomer.rentalsCount}</p>
              <p><strong>Total Spent:</strong> {formatCurrency(viewCustomer.totalSpent)}</p>
              <p><strong>Joined:</strong> {formatDate(viewCustomer.createdAt)}</p>

              <section className="customersKycSection" aria-labelledby="customer-kyc-heading">
                <h4 id="customer-kyc-heading" className="customersKycTitle">Identity documents (KYC)</h4>
                <p className="customersKycHint">
                  Review uploaded documents before approving or rejecting verification.
                </p>
                <div className="customersKycDocs">
                  <div className="customersKycDocCard">
                    <div className="customersKycDocLabel">
                      <FileText size={16} />
                      Qatar ID (QID)
                    </div>
                    <button
                      type="button"
                      className="customersKycViewBtn"
                      disabled={!viewCustomer.qidDocumentPath}
                      onClick={() =>
                        viewCustomer.qidDocumentPath &&
                        setDocViewer({ path: viewCustomer.qidDocumentPath, label: 'Qatar ID (QID)' })
                      }
                    >
                      {viewCustomer.qidDocumentPath ? 'View document' : 'Not uploaded'}
                    </button>
                  </div>
                  <div className="customersKycDocCard">
                    <div className="customersKycDocLabel">
                      <FileText size={16} />
                      Driver&apos;s license
                    </div>
                    <button
                      type="button"
                      className="customersKycViewBtn"
                      disabled={!viewCustomer.driversLicensePath}
                      onClick={() =>
                        viewCustomer.driversLicensePath &&
                        setDocViewer({ path: viewCustomer.driversLicensePath, label: "Driver's license" })
                      }
                    >
                      {viewCustomer.driversLicensePath ? 'View document' : 'Not uploaded'}
                    </button>
                  </div>
                </div>

                <label className="customersKycReason">
                  Reason (optional)
                  <textarea
                    value={verificationReason}
                    onChange={(e) => setVerificationReason(e.target.value)}
                    placeholder="Optional note for the audit log (e.g. blurry QID photo)"
                    rows={3}
                    maxLength={2000}
                  />
                </label>

                <div className="customersKycActions">
                  <button
                    type="button"
                    className="customersKycRejectBtn"
                    disabled={verifying}
                    onClick={() => void handleVerificationDecision('reject')}
                  >
                    Reject verification
                  </button>
                  <button
                    type="button"
                    className="customersKycApproveBtn"
                    disabled={verifying || (!viewCustomer.qidDocumentPath && !viewCustomer.driversLicensePath)}
                    onClick={() => void handleVerificationDecision('approve')}
                  >
                    {verifying ? 'Saving…' : 'Approve verification'}
                  </button>
                </div>
              </section>
            </div>
            <div className="adminInfoModalActions">
              <button
                className="adminInfoModalBtn"
                type="button"
                onClick={() => {
                  setViewCustomer(null)
                  setVerificationReason('')
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <CustomerDocumentViewer
        open={!!docViewer}
        path={docViewer?.path}
        label={docViewer?.label ?? 'Document'}
        onClose={() => setDocViewer(null)}
      />

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
              <p className="customersEditHint">
                KYC verification is managed from the customer detail view after reviewing identity documents.
              </p>
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
