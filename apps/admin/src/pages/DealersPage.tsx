import type { Dealer } from '@carflow/shared'
import { formatCurrency, formatDate } from '@carflow/shared'
import {
  Download,
  Eye,
  Mail,
  MapPin,
  Phone,
  Power,
  Search,
  Star,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  Clock,
  X,
} from 'lucide-react'
import type { FormEvent} from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { InfoModal } from '../components/InfoModal'
import { useAuth } from '../contexts/AuthContext'
import { AdminLayout } from '../layout/AdminLayout'
import { createDealer, deleteDealer, listDealers, updateDealerBankDetails, updateDealerStatus } from '../services/adminService'
import './DealersPage.css'

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

const STATUS_CLASS: Record<string, string> = {
  Active: 'dealersBadge dealersBadge--active',
  'Pending Approval': 'dealersBadge dealersBadge--pending',
  Suspended: 'dealersBadge dealersBadge--pending'
}

export function DealersPage() {
  const { session } = useAuth()
  const [dealers, setDealers] = useState<Dealer[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [confirmAction, setConfirmAction] = useState<
    | { type: 'toggle'; row: typeof dealerRows[0] }
    | { type: 'delete'; row: typeof dealerRows[0] }
    | null
  >(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState('')
  const [addOwnerEmail, setAddOwnerEmail] = useState('')
  const [addContactEmail, setAddContactEmail] = useState('')
  const [addContactPhone, setAddContactPhone] = useState('')
  const [addAddress, setAddAddress] = useState('')
  const [addError, setAddError] = useState('')
  const [addSubmitting, setAddSubmitting] = useState(false)
  const [detailDealerId, setDetailDealerId] = useState<string | null>(null)
  const [bankSaving, setBankSaving] = useState(false)

  const refreshDealers = useCallback(() => {
    setIsLoading(true)
    listDealers({ page, pageSize })
      .then((data) => {
        setDealers(data.items)
        setTotal(data.total)
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load dealers'))
      .finally(() => setIsLoading(false))
  }, [page, pageSize])

  const closeAddModal = () => {
    setAddOpen(false)
    setAddError('')
    setAddSubmitting(false)
  }

  const handleCreateDealer = async (event: FormEvent) => {
    event.preventDefault()
    setAddError('')
    setAddSubmitting(true)
    try {
      const created = await createDealer({
        name: addName,
        email: addOwnerEmail.trim(),
        contactEmail: addContactEmail.trim() || addOwnerEmail.trim(),
        contactPhone: addContactPhone || undefined,
        address: addAddress || undefined,
      })
      setAddName('')
      setAddOwnerEmail('')
      setAddContactEmail('')
      setAddContactPhone('')
      setAddAddress('')
      closeAddModal()
      refreshDealers()
      if (created.accountCreated && created.temporaryPassword) {
        toast.success(
          `Dealer created. Temporary password for ${created.contactEmail}: ${created.temporaryPassword}`
        )
      } else {
        toast.success('Dealer created and linked to existing account.')
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Unable to create dealer')
    } finally {
      setAddSubmitting(false)
    }
  }

  useEffect(() => {
    refreshDealers()
  }, [refreshDealers])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const detailDealer = useMemo(
    () => (detailDealerId ? dealers.find((d) => d.id === detailDealerId) ?? null : null),
    [dealers, detailDealerId]
  )

  const handleVerifyBank = async (verified: boolean) => {
    if (!detailDealer || session?.role !== 'admin') return
    setBankSaving(true)
    try {
      const updated = await updateDealerBankDetails(detailDealer.id, { verified })
      setDealers((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
      toast.success(verified ? 'Bank details verified' : 'Bank verification removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update bank details')
    } finally {
      setBankSaving(false)
    }
  }

  const dealerRows = useMemo(() => {
    return dealers.map((dealer) => {
      const pending = dealer.status === 'pending'
      return {
        id: dealer.id.slice(0, 8).toUpperCase(),
        sourceId: dealer.id,
        name: dealer.name,
        logoUrl: dealer.logoUrl,
        contact: dealer.contactEmail,
        email: dealer.contactEmail,
        phone: dealer.contactPhone ?? '',
        location: dealer.address?.trim() || '—',
        fleetSize: `${dealer.vehiclesCount} cars`,
        activeRentals: String(dealer.activeRentals),
        revenue: formatCurrency(dealer.totalRevenue),
        ratingValue: dealer.rating,
        status: dealer.status === 'suspended' ? 'Suspended' : pending ? 'Pending Approval' : 'Active',
        rawStatus: dealer.status,
      }
    })
  }, [dealers])

  const filteredRows = useMemo(() => {
    const normalizedStatus = statusFilter.toLowerCase()
    const base = normalizedStatus === 'all'
      ? dealerRows
      : dealerRows.filter(row => row.status.toLowerCase().includes(normalizedStatus))
    if (!searchQuery.trim()) return base
    const query = searchQuery.toLowerCase()
    return base.filter(row =>
      [row.name, row.contact, row.email].some(value => value.toLowerCase().includes(query))
    )
  }, [dealerRows, searchQuery, statusFilter])

  const statusOptions = useMemo(() => {
    const values = Array.from(new Set(dealerRows.map(row => row.status)))
    return ['all', ...values]
  }, [dealerRows])

  const stats = useMemo(() => {
    const active = dealerRows.filter(row => row.status === 'Active').length
    const pending = dealerRows.filter(row => row.status === 'Pending Approval').length
    const revenue = dealerRows.reduce((sum, row) => {
      const numeric = Number(row.revenue.replace(/[^\d.]/g, ''))
      return sum + (Number.isNaN(numeric) ? 0 : numeric)
    }, 0)

    return {
      total,
      active,
      pending,
      revenue,
    }
  }, [dealerRows, total])

  const handleToggleStatus = (row: typeof dealerRows[0]) => {
    setConfirmAction({ type: 'toggle', row })
  }

  const handleDeleteDealer = (row: typeof dealerRows[0]) => {
    setConfirmAction({ type: 'delete', row })
  }

  const confirmDealerAction = () => {
    if (!confirmAction) return
    const { row } = confirmAction
    if (confirmAction.type === 'toggle') {
      const nextStatus = row.status === 'Active' ? 'suspended' : 'active'
      updateDealerStatus(row.sourceId, nextStatus)
        .then(() => {
          setConfirmAction(null)
          refreshDealers()
        })
        .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to update dealer status'))
      return
    }
    deleteDealer(row.sourceId)
      .then(() => {
        setConfirmAction(null)
        toast.success('Dealer deleted')
        refreshDealers()
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to delete dealer'))
  }

  return (
    <AdminLayout title="Dealers" subtitle="Dealer accounts and approvals">
      <div className="dealersPage">
        <div className="dealersStats">
          <div className="dealersStatCard">
            <div className="dealersStatHeader">
              <div className="dealersStatLabel">Total Dealers</div>
              <Users size={18} className="dealersStatIcon" />
            </div>
            <div className="dealersStatValue">{stats.total}</div>
          </div>
          <div className="dealersStatCard">
            <div className="dealersStatHeader">
              <div className="dealersStatLabel">Active Dealers</div>
              <UserCheck size={18} className="dealersStatIcon" />
            </div>
            <div className="dealersStatValue dealersStatValue--green">{stats.active}</div>
            <div className="dealersStatSub">on this page</div>
          </div>
          <div className="dealersStatCard">
            <div className="dealersStatHeader">
              <div className="dealersStatLabel">Total Revenue</div>
              <Wallet size={18} className="dealersStatIcon" />
            </div>
            <div className="dealersStatValue dealersStatValue--blue">
              QAR {stats.revenue.toLocaleString('en-US')}
            </div>
            <div className="dealersStatSub">on this page</div>
          </div>
          <div className="dealersStatCard">
            <div className="dealersStatHeader">
              <div className="dealersStatLabel">Pending Approval</div>
              <Clock size={18} className="dealersStatIcon" />
            </div>
            <div className="dealersStatValue dealersStatValue--orange">{stats.pending}</div>
            <div className="dealersStatSub">on this page</div>
          </div>
        </div>

        <div className="dealersControlCard">
          <div className="dealersControlHeader">
            <div className="dealersControlTitle">Dealer Management</div>
            <div className="dealersControlSubtitle">Manage and monitor all registered dealers</div>
          </div>
          <div className="dealersControlRow">
            <button
              type="button"
              className="dealersAddBtn"
              onClick={() => {
                setAddOpen(true)
                setAddError('')
              }}
            >
              <UserPlus size={16} />
              Add Dealer
            </button>
            <div className="dealersSearch">
              <Search size={16} className="dealersSearchIcon" />
              <input
                type="text"
                placeholder="Search by company or contact name..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>
            <label className="dealersFilterBtn">
              <select
                aria-label="Filter dealers by status"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {statusOptions.map(option => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'All Dealers' : option}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="dealersExportBtn"
              type="button"
              onClick={() => {
                downloadCsv(
                  'dealers.csv',
                  filteredRows.map(row => ({
                    id: row.id,
                    name: row.name,
                    contact: row.contact,
                    email: row.email,
                    phone: row.phone,
                    status: row.status,
                  }))
                )
              }}
            >
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        <div className="dealersTableCard">
          {isLoading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
          ) : (
            <>
              <div className="dealersTableWrap">
                <table className="dealersTable">
                  <thead>
                    <tr>
                      <th>Dealer</th>
                      <th>Contact</th>
                      <th>Location</th>
                      <th>Fleet Size</th>
                      <th>Active Rentals</th>
                      <th>Revenue</th>
                      <th>Rating</th>
                      <th>Status</th>
                      <th className="dealersTableActionsHead">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => (
                      <tr key={row.sourceId}>
                        <td>
                          <div className="dealersDealerCell">
                            <div className="dealersAvatar">
                              {row.logoUrl ? (
                                <img src={row.logoUrl} alt="" className="dealersAvatarImg" />
                              ) : (
                                <Users size={16} />
                              )}
                            </div>
                            <div>
                              <div className="dealersDealerName">{row.name}</div>
                              <div className="dealersDealerId">{row.id}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="dealersContactCell">
                            <div className="dealersContactName">{row.contact}</div>
                            <div className="dealersContactMeta">
                              <Mail size={14} />
                              {row.email}
                            </div>
                            {row.phone ? (
                              <div className="dealersContactMeta">
                                <Phone size={14} />
                                {row.phone}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td>
                          <div className="dealersLocation">
                            <MapPin size={14} />
                            {row.location}
                          </div>
                        </td>
                        <td>{row.fleetSize}</td>
                        <td>{row.activeRentals}</td>
                        <td>{row.revenue}</td>
                        <td>
                          {row.ratingValue > 0 ? (
                            <div className="dealersRating">
                              <Star size={14} />
                              <span>{row.ratingValue.toFixed(1)}</span>
                            </div>
                          ) : (
                            <span className="dealersRating dealersRating--empty">—</span>
                          )}
                        </td>
                        <td>
                          <span className={STATUS_CLASS[row.status]}>{row.status}</span>
                        </td>
                        <td>
                          <div className="dealersActions">
                            <button
                              type="button"
                              className="dealersActionBtn"
                              title="View details"
                              onClick={() => setDetailDealerId(row.sourceId)}
                            >
                              <Eye size={16} />
                            </button>
                            <button
                              type="button"
                              className="dealersActionBtn"
                              title={row.status === 'Active' ? 'Suspend dealer' : 'Activate dealer'}
                              onClick={() => handleToggleStatus(row)}
                            >
                              <Power size={16} />
                            </button>
                            <button
                              type="button"
                              className="dealersActionBtn dealersActionBtn--danger"
                              title="Delete dealer"
                              onClick={() => handleDeleteDealer(row)}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="customersPagination" role="navigation" aria-label="Dealer list pages">
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
            </>
          )}
        </div>
      </div>
      <InfoModal
        open={!!infoModal}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onClose={() => setInfoModal(null)}
      />
      <InfoModal
        open={!!confirmAction}
        title={
          confirmAction?.type === 'delete'
            ? 'Delete dealer?'
            : confirmAction?.row.status === 'Active'
              ? 'Suspend dealer?'
              : 'Activate dealer?'
        }
        message={
          confirmAction?.type === 'delete'
            ? `Delete dealer "${confirmAction.row.name}"? This removes the dealer record but keeps the owner profile.`
            : confirmAction?.row.status === 'Active'
              ? `Are you sure you want to suspend "${confirmAction.row.name}"?`
              : `Activate dealer "${confirmAction?.row.name}"?`
        }
        onClose={() => setConfirmAction(null)}
        onConfirm={confirmDealerAction}
        confirmLabel={confirmAction?.type === 'delete' ? 'Delete' : 'Confirm'}
      />

      {detailDealer ? (
        <div className="dealersAddOverlay" role="dialog" aria-modal="true" aria-labelledby="dealerDetailTitle">
          <div className="dealersAddModal dealersDetailModal">
            <button
              type="button"
              className="dealersAddClose"
              onClick={() => setDetailDealerId(null)}
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <h3 id="dealerDetailTitle" className="dealersAddTitle">
              {detailDealer.name}
            </h3>
            <p className="dealersAddHint">
              {detailDealer.contactEmail}
              {detailDealer.contactPhone ? ` · ${detailDealer.contactPhone}` : ''}
            </p>
            <dl className="dealersDetailList">
              <div>
                <dt>Status</dt>
                <dd>{detailDealer.status}</dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>{detailDealer.address?.trim() || '—'}</dd>
              </div>
              <div>
                <dt>Fleet</dt>
                <dd>{detailDealer.vehiclesCount} vehicles · {detailDealer.activeRentals} active rentals</dd>
              </div>
            </dl>
            <div className="dealersBankBlock">
              <h4 className="dealersBankTitle">
                <Wallet size={16} />
                Payout bank details
              </h4>
              {!detailDealer.bankIban ? (
                <p className="dealersBankEmpty">No bank details on file.</p>
              ) : (
                <>
                  <p>
                    <strong>{detailDealer.bankAccountName || '—'}</strong>
                    <br />
                    {detailDealer.bankName || 'Bank'} · {detailDealer.bankIban}
                  </p>
                  <p className="dealersBankStatus">
                    {detailDealer.bankDetailsVerifiedAt
                      ? `Verified ${formatDate(detailDealer.bankDetailsVerifiedAt)}`
                      : 'Not verified — payouts will be skipped until verified.'}
                  </p>
                </>
              )}
              {session?.role === 'admin' && detailDealer.bankIban ? (
                <div className="dealersBankActions">
                  {!detailDealer.bankDetailsVerifiedAt ? (
                    <button
                      type="button"
                      className="dealersAddBtn"
                      disabled={bankSaving}
                      onClick={() => handleVerifyBank(true)}
                    >
                      Verify bank details
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="dealersExportBtn"
                      disabled={bankSaving}
                      onClick={() => handleVerifyBank(false)}
                    >
                      Revoke verification
                    </button>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {addOpen ? (
        <div className="dealersAddOverlay" role="dialog" aria-modal="true" aria-labelledby="dealersAddTitle">
          <div className="dealersAddModal">
            <button
              type="button"
              className="dealersAddClose"
              onClick={closeAddModal}
              aria-label="Close"
            >
              <X size={16} />
            </button>
            <h3 id="dealersAddTitle" className="dealersAddTitle">
              Add dealer
            </h3>
            <p className="dealersAddHint">
              Enter the owner email. If they do not have an account yet, one will be created
              automatically and a temporary password will be shown.
            </p>
            <form className="dealersAddForm" onSubmit={handleCreateDealer}>
              <label className="dealersAddLabel">
                Name
                <input
                  className="dealersAddInput"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="Dealership name"
                  required
                />
              </label>
              <label className="dealersAddLabel">
                Owner email
                <input
                  className="dealersAddInput"
                  type="email"
                  value={addOwnerEmail}
                  onChange={(e) => setAddOwnerEmail(e.target.value)}
                  placeholder="owner@example.com"
                  required
                />
              </label>
              <label className="dealersAddLabel">
                Contact email
                <input
                  className="dealersAddInput"
                  type="email"
                  value={addContactEmail}
                  onChange={(e) => setAddContactEmail(e.target.value)}
                  placeholder="contact@dealership.com"
                  required
                />
              </label>
              <label className="dealersAddLabel">
                Contact phone
                <input
                  className="dealersAddInput"
                  type="tel"
                  value={addContactPhone}
                  onChange={(e) => setAddContactPhone(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              <label className="dealersAddLabel">
                Address
                <input
                  className="dealersAddInput"
                  value={addAddress}
                  onChange={(e) => setAddAddress(e.target.value)}
                  placeholder="Optional"
                />
              </label>
              {addError ? <div className="dealersAddError">{addError}</div> : null}
              <div className="dealersAddActions">
                <button type="button" className="dealersAddCancel" onClick={closeAddModal}>
                  Cancel
                </button>
                <button type="submit" className="dealersAddSubmit" disabled={addSubmitting}>
                  {addSubmitting ? 'Creating…' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </AdminLayout>
  )
}
