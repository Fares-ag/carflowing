import { useEffect, useMemo, useState } from 'react'
import {
  getCustomerDocumentsForDealer,
  listBookingRequests,
  updateBookingRequestStatus,
  type BookingRequestWithVehicle,
  type CustomerDocumentsForDealer,
} from '../services/dealerService'
import { getSignedDocumentUrl } from '@carflow/shared'
import { Sidebar } from '../components/Sidebar'
import { Header } from '../components/Header'
import { BookingRequestNoteDetails } from '../components/BookingRequestNoteDetails'
import { toast } from 'sonner'
import { Check, ChevronDown, Copy, Eye, FileText, Mail, Search, X } from 'lucide-react'
import './BookingRequests.css'

function mailtoCustomer(row: BookingRequestWithVehicle) {
  const email = row.customer?.email?.trim()
  if (!email) {
    toast.error('No email on file for this customer.')
    return
  }
  const vehicle = row.vehicle?.name ?? 'vehicle'
  const subject = `Booking request ${row.id.slice(0, 8)}… — ${vehicle}`
  const body = `Hi,\n\nRegarding booking request:\n${row.id}\nVehicle: ${vehicle}\n\n`
  window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

async function copyRequestId(id: string) {
  try {
    await navigator.clipboard.writeText(id)
    toast.success('Request ID copied')
  } catch {
    toast.error('Could not copy to clipboard')
  }
}

export function BookingRequests() {
  const [requests, setRequests] = useState<BookingRequestWithVehicle[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [detailRow, setDetailRow] = useState<BookingRequestWithVehicle | null>(null)
  const [detailDocs, setDetailDocs] = useState<CustomerDocumentsForDealer | null>(null)
  const [detailDocsLoading, setDetailDocsLoading] = useState(false)
  const [detailDocsError, setDetailDocsError] = useState<string | null>(null)

  const [declineId, setDeclineId] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [declineSubmitting, setDeclineSubmitting] = useState(false)

  const refresh = (showLoading = false) => {
    if (showLoading) setLoading(true)
    setError(null)
    return listBookingRequests({ pageSize: 50 })
      .then((data) => setRequests(data.items))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => {
        if (showLoading) setLoading(false)
      })
  }

  useEffect(() => {
    void refresh(true)
  }, [])

  useEffect(() => {
    if (!detailRow) {
      setDetailDocs(null)
      setDetailDocsError(null)
      return
    }
    setDetailDocsLoading(true)
    setDetailDocs(null)
    setDetailDocsError(null)
    getCustomerDocumentsForDealer(detailRow.customerId)
      .then((docs) => {
        setDetailDocs(docs)
      })
      .catch((err) => {
        setDetailDocs({ qidDocumentPath: null, driversLicensePath: null })
        setDetailDocsError(err instanceof Error ? err.message : 'Could not load document paths')
      })
      .finally(() => setDetailDocsLoading(false))
  }, [detailRow])

  const filteredRows = useMemo(() => {
    let rows = requests
    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.status === statusFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const vName = (r: BookingRequestWithVehicle) => r.vehicle?.name?.toLowerCase() ?? ''
      const cEmail = (r: BookingRequestWithVehicle) => r.customer?.email?.toLowerCase() ?? ''
      rows = rows.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          vName(r).includes(q) ||
          cEmail(r).includes(q) ||
          (r.note ?? '').toLowerCase().includes(q)
      )
    }
    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [requests, statusFilter, searchQuery])

  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === 'pending').length
    const approved = requests.filter((r) => r.status === 'approved').length
    const declined = requests.filter((r) => r.status === 'declined').length
    return { total: requests.length, pending, approved, declined }
  }, [requests])

  const handleApprove = (id: string) => {
    setError(null)
    updateBookingRequestStatus(id, 'approved')
      .then(() => void refresh(false))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to approve'))
  }

  const openDecline = (id: string) => {
    setError(null)
    setDeclineId(id)
    setDeclineReason('')
  }

  const submitDecline = () => {
    if (!declineId) return
    const trimmed = declineReason.trim()
    if (trimmed.length < 8) {
      setError('Please enter a clear reason (at least 8 characters) for the customer.')
      return
    }
    setDeclineSubmitting(true)
    setError(null)
    updateBookingRequestStatus(declineId, 'declined', { declineReason: trimmed })
      .then(() => {
        setDeclineId(null)
        setDeclineReason('')
        return refresh(false)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to decline'))
      .finally(() => setDeclineSubmitting(false))
  }

  const openDocument = async (path: string | null, label: string) => {
    if (!path) {
      setError(`No ${label} file on file for this customer.`)
      return
    }
    try {
      const url = await getSignedDocumentUrl(path, 3600)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not open ${label}`)
    }
  }

  return (
    <div className="dashboard-page">
      <Sidebar />
      <Header />
      <div className="bookingRequestsPage">
        <div className="brPageHeader">
          <h1 className="brPageTitle">Booking Requests</h1>
          <p className="brPageSubtitle">
            Review customer documents, then approve or decline. Charges apply only after you approve.
          </p>
        </div>
        {error && (
          <div className="brError">
            {error}
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}
        <div className="brStatsRow">
          <div className="brStatCard">
            <div className="brStatLabel">Total</div>
            <div className="brStatValue">{stats.total}</div>
          </div>
          <div className="brStatCard brStatCard--amber">
            <div className="brStatLabel">Pending</div>
            <div className="brStatValue">{stats.pending}</div>
          </div>
          <div className="brStatCard brStatCard--green">
            <div className="brStatLabel">Approved</div>
            <div className="brStatValue">{stats.approved}</div>
          </div>
          <div className="brStatCard brStatCard--red">
            <div className="brStatLabel">Declined</div>
            <div className="brStatValue">{stats.declined}</div>
          </div>
        </div>

        <div className="brToolbar">
          <div className="brSearch">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by ID, vehicle, customer email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <label className="brSelect">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="declined">Declined</option>
            </select>
            <ChevronDown size={14} />
          </label>
        </div>

        <div className="brTableCard">
          <table className="brTable">
            <thead>
              <tr>
                <th>ID</th>
                <th>Customer</th>
                <th>Vehicle</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <div className="brLoading" role="status">
                      Loading booking requests...
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="brId">{row.id.slice(0, 12)}...</div>
                    </td>
                    <td>
                      <div className="brCustomer">
                        <span className="brCustomerName">{row.customer?.name ?? '—'}</span>
                        <span className="brCustomerEmail">{row.customer?.email ?? '—'}</span>
                      </div>
                    </td>
                    <td>{row.vehicle?.name ?? 'Unknown'}</td>
                    <td>
                      <span className={`brBadge brBadge--${row.status}`}>{row.status}</span>
                    </td>
                    <td>{new Date(row.createdAt).toLocaleDateString()}</td>
                    <td>
                      <div className="brActions">
                        <button
                          type="button"
                          className="brActionBtn brActionBtn--view"
                          onClick={() => setDetailRow(row)}
                          title="View details & documents"
                        >
                          <Eye size={16} />
                        </button>
                        <button
                          type="button"
                          className="brActionBtn brActionBtn--mail"
                          onClick={() => mailtoCustomer(row)}
                          title="Email customer"
                        >
                          <Mail size={16} />
                        </button>
                        <button
                          type="button"
                          className="brActionBtn brActionBtn--copy"
                          onClick={() => void copyRequestId(row.id)}
                          title="Copy full request ID"
                        >
                          <Copy size={16} />
                        </button>
                        {row.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              className="brActionBtn brActionBtn--approve"
                              onClick={() => handleApprove(row.id)}
                              title="Approve"
                            >
                              <Check size={16} />
                            </button>
                            <button
                              type="button"
                              className="brActionBtn brActionBtn--decline"
                              onClick={() => openDecline(row.id)}
                              title="Decline"
                            >
                              <X size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {!loading && filteredRows.length === 0 && (
            <div className="brEmpty">
              {requests.length === 0 ? 'No booking requests yet.' : 'No requests match your filters.'}
            </div>
          )}
        </div>
      </div>

      {detailRow && (
        <div
          className="brModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="br-detail-title"
          onClick={() => setDetailRow(null)}
        >
          <div className="brModal" onClick={(e) => e.stopPropagation()}>
            <div className="brModalHeader">
              <h2 id="br-detail-title">Booking request</h2>
              <button type="button" className="brModalClose" onClick={() => setDetailRow(null)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="brModalBody">
              <p className="brModalMeta">
                <strong>Customer:</strong> {detailRow.customer?.name ?? '—'} ({detailRow.customer?.email ?? '—'})
              </p>
              <p className="brModalMeta">
                <strong>Vehicle:</strong> {detailRow.vehicle?.name ?? 'Unknown'}
              </p>
              <p className="brModalMeta">
                <strong>Status:</strong> {detailRow.status}
              </p>
              {detailRow.declineReason && detailRow.status === 'declined' && (
                <p className="brModalMeta brModalMeta--warn">
                  <strong>Decline reason (customer-visible):</strong> {detailRow.declineReason}
                </p>
              )}
              <div className="brModalDocs">
                <h3>Identity documents</h3>
                {detailDocsError && (
                  <p className="brModalHint brModalHint--warn" role="alert">
                    {detailDocsError} — document links may not work until this is resolved.
                  </p>
                )}
                {detailDocsLoading ? (
                  <p className="brModalHint">Loading document info…</p>
                ) : (
                  <div className="brDocButtons">
                    <button
                      type="button"
                      className="brDocBtn"
                      onClick={() => void openDocument(detailDocs?.qidDocumentPath ?? null, 'QID')}
                    >
                      <FileText size={16} /> Open QID
                    </button>
                    <button
                      type="button"
                      className="brDocBtn"
                      onClick={() =>
                        void openDocument(detailDocs?.driversLicensePath ?? null, "driver's license")
                      }
                    >
                      <FileText size={16} /> Open driver&apos;s license
                    </button>
                  </div>
                )}
              </div>
              <div className="brModalNote">
                <h3>Request details</h3>
                <BookingRequestNoteDetails note={detailRow.note} />
              </div>
              {detailRow.status === 'pending' && (
                <div className="brModalFooter">
                  <button type="button" className="brModalBtn brModalBtn--secondary" onClick={() => setDetailRow(null)}>
                    Close
                  </button>
                  <button
                    type="button"
                    className="brModalBtn brModalBtn--danger"
                    onClick={() => {
                      openDecline(detailRow.id)
                      setDetailRow(null)
                    }}
                  >
                    Decline…
                  </button>
                  <button
                    type="button"
                    className="brModalBtn brModalBtn--primary"
                    onClick={() => {
                      handleApprove(detailRow.id)
                      setDetailRow(null)
                    }}
                  >
                    Approve
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {declineId && (
        <div
          className="brModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="br-decline-title"
          onClick={() => !declineSubmitting && setDeclineId(null)}
        >
          <div className="brModal brModal--narrow" onClick={(e) => e.stopPropagation()}>
            <div className="brModalHeader">
              <h2 id="br-decline-title">Decline request</h2>
              <button
                type="button"
                className="brModalClose"
                disabled={declineSubmitting}
                onClick={() => setDeclineId(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="brModalBody">
              <p className="brModalHint">
                The customer will see this message in their account. Be clear and professional.
              </p>
              <label className="brDeclineLabel">
                Reason for the customer
                <textarea
                  className="brDeclineTextarea"
                  rows={5}
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="e.g. We could not verify your driver’s license against our requirements."
                  disabled={declineSubmitting}
                />
              </label>
              <div className="brModalFooter">
                <button
                  type="button"
                  className="brModalBtn brModalBtn--secondary"
                  disabled={declineSubmitting}
                  onClick={() => setDeclineId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="brModalBtn brModalBtn--danger"
                  disabled={declineSubmitting}
                  onClick={() => void submitDecline()}
                >
                  {declineSubmitting ? 'Submitting…' : 'Decline request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
