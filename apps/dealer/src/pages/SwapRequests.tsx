import { formatDateOrDash } from '@carflow/shared'
import { ArrowRight, Check, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Header } from '../components/Header'
import { Sidebar } from '../components/Sidebar'
import {
  listSwapRequests,
  updateSwapRequestStatus,
  type SwapRequestWithRelations,
} from '../services/dealerService'
import './SwapRequests.css'

const PAGE_SIZE = 10

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message && err.message !== 'Request failed'
    ? err.message
    : fallback
}

export function SwapRequests() {
  const [swaps, setSwaps] = useState<SwapRequestWithRelations[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [approveSwap, setApproveSwap] = useState<SwapRequestWithRelations | null>(null)
  const [mileageOut, setMileageOut] = useState('')
  const [mileageIn, setMileageIn] = useState('')
  const [approveSubmitting, setApproveSubmitting] = useState(false)

  const [declineSwap, setDeclineSwap] = useState<SwapRequestWithRelations | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [declineSubmitting, setDeclineSubmitting] = useState(false)

  const refresh = useCallback(
    (showLoading = false) => {
      if (showLoading) setLoading(true)
      setError(null)
      return listSwapRequests({ page, pageSize: PAGE_SIZE })
        .then((data) => {
          setSwaps(data.items)
          setTotal(data.total)
        })
        .catch((err) => setError(errorMessage(err, 'Failed to load swap requests')))
        .finally(() => {
          if (showLoading) setLoading(false)
        })
    },
    [page]
  )

  useEffect(() => {
    void refresh(true)
  }, [refresh])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const openApprove = (swap: SwapRequestWithRelations) => {
    setError(null)
    setApproveSwap(swap)
    setMileageOut('')
    setMileageIn('')
  }

  const parseOptionalMileage = (raw: string, label: string): number | undefined | null => {
    if (raw.trim() === '') return undefined
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) {
      toast.error(`Enter a valid ${label} (km) or leave it empty.`)
      return null
    }
    return n
  }

  const submitApprove = () => {
    if (!approveSwap || approveSubmitting) return
    const out = parseOptionalMileage(mileageOut, 'mileage out')
    if (out === null) return
    const inn = parseOptionalMileage(mileageIn, 'mileage in')
    if (inn === null) return
    setApproveSubmitting(true)
    updateSwapRequestStatus(approveSwap.id, {
      status: 'approved',
      mileageOut: out,
      mileageIn: inn,
    })
      .then(() => {
        toast.success('Swap approved — subscription moved to the requested vehicle')
        setApproveSwap(null)
        return refresh(false)
      })
      .catch((err) => toast.error(errorMessage(err, 'Could not approve swap')))
      .finally(() => setApproveSubmitting(false))
  }

  const openDecline = (swap: SwapRequestWithRelations) => {
    setError(null)
    setDeclineSwap(swap)
    setDeclineReason('')
  }

  const submitDecline = () => {
    if (!declineSwap || declineSubmitting) return
    const trimmed = declineReason.trim()
    if (trimmed.length < 8) {
      setError('Please enter a clear reason (at least 8 characters) for the customer.')
      return
    }
    setDeclineSubmitting(true)
    setError(null)
    updateSwapRequestStatus(declineSwap.id, { status: 'declined', declineReason: trimmed })
      .then(() => {
        toast.success('Swap request declined')
        setDeclineSwap(null)
        setDeclineReason('')
        return refresh(false)
      })
      .catch((err) => toast.error(errorMessage(err, 'Could not decline swap')))
      .finally(() => setDeclineSubmitting(false))
  }

  return (
    <div className="dashboard-page">
      <Sidebar />
      <Header />
      <div className="swapsPage">
        <div className="swPageHeader">
          <h1 className="swPageTitle">Swap Requests</h1>
          <p className="swPageSubtitle">
            Customers can ask to swap their subscription to another car in your fleet. Approving
            moves the subscription to the requested vehicle.
          </p>
        </div>

        {error && (
          <div className="swError" role="alert">
            {error}
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
              ×
            </button>
          </div>
        )}

        <div className="swTableCard">
          <table className="swTable">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Swap</th>
                <th>Note</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6}>
                    <div className="swLoading" role="status">
                      Loading swap requests...
                    </div>
                  </td>
                </tr>
              ) : (
                swaps.map((swap) => (
                  <tr key={swap.id}>
                    <td>
                      <div className="swCustomer">
                        <span className="swCustomerName">{swap.customer?.name ?? '—'}</span>
                        <span className="swCustomerEmail">{swap.customer?.email ?? '—'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="swVehicles">
                        <span className="swVehicle">{swap.currentVehicle?.name ?? 'Unknown'}</span>
                        <ArrowRight size={14} className="swArrow" aria-label="to" />
                        <span className="swVehicle swVehicle--requested">
                          {swap.requestedVehicle?.name ?? 'Unknown'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="swNote" title={swap.note ?? undefined}>
                        {swap.note?.trim() || '—'}
                      </div>
                      {swap.status === 'declined' && swap.declineReason && (
                        <div className="swDeclineReason">Declined: {swap.declineReason}</div>
                      )}
                    </td>
                    <td>
                      <span className={`swBadge swBadge--${swap.status}`}>{swap.status}</span>
                    </td>
                    <td>{formatDateOrDash(swap.createdAt)}</td>
                    <td>
                      {swap.status === 'pending' ? (
                        <div className="swActions">
                          <button
                            type="button"
                            className="swActionBtn swActionBtn--approve"
                            onClick={() => openApprove(swap)}
                            title="Approve swap"
                            aria-label="Approve swap"
                            disabled={!!approveSwap || !!declineSwap}
                          >
                            <Check size={16} />
                          </button>
                          <button
                            type="button"
                            className="swActionBtn swActionBtn--decline"
                            onClick={() => openDecline(swap)}
                            title="Decline swap"
                            aria-label="Decline swap"
                            disabled={!!approveSwap || !!declineSwap}
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <span className="swNoActions">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {!loading && swaps.length === 0 && (
            <div className="swEmpty">No swap requests yet.</div>
          )}
          {!loading && total > PAGE_SIZE && (
            <div className="swPagination">
              <span className="swPageInfo">
                Page {page} of {totalPages} ({total} requests)
              </span>
              <div className="swPageBtns">
                <button
                  type="button"
                  className="swPageBtn"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <button
                  type="button"
                  className="swPageBtn"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  aria-label="Next page"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {approveSwap && (
        <div
          className="swModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sw-approve-title"
          onClick={() => !approveSubmitting && setApproveSwap(null)}
        >
          <div className="swModal" onClick={(e) => e.stopPropagation()}>
            <div className="swModalHeader">
              <h2 id="sw-approve-title">Approve swap</h2>
              <button
                type="button"
                className="swModalClose"
                disabled={approveSubmitting}
                onClick={() => setApproveSwap(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="swModalBody">
              <p className="swModalHint">
                {approveSwap.currentVehicle?.name ?? 'Current vehicle'} →{' '}
                {approveSwap.requestedVehicle?.name ?? 'requested vehicle'}. The subscription moves
                to the requested vehicle immediately. Mileage readings are optional.
              </p>
              <label className="swFormLabel" htmlFor="sw-mileage-out">
                Mileage of returned car (km, optional)
                <input
                  id="sw-mileage-out"
                  type="number"
                  min={0}
                  value={mileageOut}
                  onChange={(e) => setMileageOut(e.target.value)}
                  placeholder="e.g. 15200"
                  disabled={approveSubmitting}
                />
              </label>
              <label className="swFormLabel" htmlFor="sw-mileage-in">
                Mileage of new car (km, optional)
                <input
                  id="sw-mileage-in"
                  type="number"
                  min={0}
                  value={mileageIn}
                  onChange={(e) => setMileageIn(e.target.value)}
                  placeholder="e.g. 8100"
                  disabled={approveSubmitting}
                />
              </label>
              <div className="swModalFooter">
                <button
                  type="button"
                  className="swModalBtn swModalBtn--secondary"
                  disabled={approveSubmitting}
                  onClick={() => setApproveSwap(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="swModalBtn swModalBtn--primary"
                  disabled={approveSubmitting}
                  aria-busy={approveSubmitting}
                  onClick={() => void submitApprove()}
                >
                  {approveSubmitting ? 'Approving…' : 'Approve swap'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {declineSwap && (
        <div
          className="swModalOverlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sw-decline-title"
          onClick={() => !declineSubmitting && setDeclineSwap(null)}
        >
          <div className="swModal" onClick={(e) => e.stopPropagation()}>
            <div className="swModalHeader">
              <h2 id="sw-decline-title">Decline swap</h2>
              <button
                type="button"
                className="swModalClose"
                disabled={declineSubmitting}
                onClick={() => setDeclineSwap(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="swModalBody">
              <p className="swModalHint">
                The customer will see this message in their account. Be clear and professional.
              </p>
              <label className="swFormLabel">
                Reason for the customer
                <textarea
                  className="swDeclineTextarea"
                  rows={5}
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="e.g. The requested car is already reserved for another customer."
                  disabled={declineSubmitting}
                />
              </label>
              <div className="swModalFooter">
                <button
                  type="button"
                  className="swModalBtn swModalBtn--secondary"
                  disabled={declineSubmitting}
                  onClick={() => setDeclineSwap(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="swModalBtn swModalBtn--danger"
                  disabled={declineSubmitting}
                  onClick={() => void submitDecline()}
                >
                  {declineSubmitting ? 'Submitting…' : 'Decline swap'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
