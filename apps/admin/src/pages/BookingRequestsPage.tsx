import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BookingRequest, Vehicle } from '@carflow/shared'
import {
  deleteBookingRequest,
  listBookingRequests,
  listVehicles,
  updateBookingRequestStatus,
} from '../services/adminService'
import { AdminLayout } from '../layout/AdminLayout'
import { InfoModal } from '../components/InfoModal'
import { Check, ChevronDown, Search, Trash2, X } from 'lucide-react'
import './BookingRequestsPage.css'

export function BookingRequestsPage() {
  const [requests, setRequests] = useState<BookingRequest[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isError, setIsError] = useState(false)

  const refresh = useCallback((options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsLoading(true)
      setIsError(false)
    }
    return Promise.all([
      listBookingRequests({ pageSize: 50 }),
      listVehicles({ pageSize: 200 }),
    ])
      .then(([reqData, vehicleData]) => {
        setRequests(reqData.items)
        setVehicles(vehicleData.items)
        setIsError(false)
      })
      .catch(() => {
        if (!options?.silent) {
          setIsError(true)
        }
      })
      .finally(() => {
        if (!options?.silent) {
          setIsLoading(false)
        }
      })
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles])

  const filteredRows = useMemo(() => {
    let rows = requests.map((req) => ({
      ...req,
      vehicleName: vehicleMap.get(req.vehicleId)?.name ?? 'Unknown',
    }))
    if (statusFilter !== 'all') {
      rows = rows.filter((r) => r.status === statusFilter)
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      rows = rows.filter(
        (r) =>
          r.id.toLowerCase().includes(q) ||
          r.vehicleName.toLowerCase().includes(q) ||
          (r.note ?? '').toLowerCase().includes(q)
      )
    }
    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }, [requests, vehicles, statusFilter, searchQuery, vehicleMap])

  const stats = useMemo(() => {
    const pending = requests.filter((r) => r.status === 'pending').length
    const approved = requests.filter((r) => r.status === 'approved').length
    const declined = requests.filter((r) => r.status === 'declined').length
    return { total: requests.length, pending, approved, declined }
  }, [requests])

  const handleApprove = (id: string) => {
    updateBookingRequestStatus(id, 'approved')
      .then(() => refresh({ silent: true }))
      .catch((err) =>
        setInfoModal({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to approve' })
      )
  }

  const handleDecline = (id: string) => {
    updateBookingRequestStatus(id, 'declined')
      .then(() => refresh({ silent: true }))
      .catch((err) =>
        setInfoModal({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to decline' })
      )
  }

  const handleDelete = (id: string) => {
    deleteBookingRequest(id)
      .then(() => refresh({ silent: true }))
      .catch((err) =>
        setInfoModal({ title: 'Error', message: err instanceof Error ? err.message : 'Failed to delete' })
      )
  }

  return (
    <AdminLayout title="Booking Requests" subtitle="Approve, decline, or manage customer booking requests">
      <div className="bookingRequestsPage">
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
              placeholder="Search by ID, vehicle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              disabled={isLoading || isError}
            />
          </div>
          <label className="brSelect">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              disabled={isLoading || isError}
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
          {isLoading ? (
            <div className="brEmpty" role="status">
              Loading booking requests…
            </div>
          ) : isError ? (
            <div className="brEmpty" role="alert">
              Failed to load booking requests.{' '}
              <button type="button" className="brActionBtn" onClick={() => refresh()}>
                Retry
              </button>
            </div>
          ) : (
            <>
              <table className="brTable">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Vehicle</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <div className="brId">{row.id.slice(0, 8)}...</div>
                      </td>
                      <td>{row.vehicleName}</td>
                      <td>
                        <span className={`brBadge brBadge--${row.status}`}>{row.status}</span>
                      </td>
                      <td>{new Date(row.createdAt).toLocaleDateString()}</td>
                      <td>
                        <div className="brActions">
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
                                onClick={() => handleDecline(row.id)}
                                title="Decline"
                              >
                                <X size={16} />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            className="brActionBtn brActionBtn--delete"
                            onClick={() => handleDelete(row.id)}
                            title="Delete"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRows.length === 0 && <div className="brEmpty">No booking requests found.</div>}
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
    </AdminLayout>
  )
}
