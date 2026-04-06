import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { BookingRequest } from '@carflow/shared'
import {
  createBookingRequest,
  listBookingRequestsWithVehicles,
  updateBookingRequestStatus,
  updateBookingRequestNote,
} from '../services/customerService'
import { toast } from '../hooks/useToast'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { InfoModal } from '../components/shared/InfoModal'
import { ArrowLeft, Calendar, ChevronDown, Clock, Copy, DollarSign, MapPin, MessageCircle, Plus, RefreshCw, Search } from 'lucide-react'
import './MyRequests.css'

export function MyRequests() {
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('date')
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [editModal, setEditModal] = useState<{
    sourceId: string
    requestId: string
    note: string
    status: BookingRequest['status']
  } | null>(null)

  const queryClient = useQueryClient()
  const { data: requestsResponse, refetch: refreshRequests, isLoading, error: queryError } = useQuery({
    queryKey: ['bookingRequests'],
    queryFn: () => listBookingRequestsWithVehicles({ pageSize: 50 }),
  })
  const requestsData = requestsResponse?.items ?? []

  function parseNote(note: string | undefined) {
    if (!note) return null
    try {
      const parsed = JSON.parse(note) as {
        duration?: string
        startDate?: string
        delivery?: { location?: string; date?: string; time?: string }
        contact?: { firstName?: string; lastName?: string; email?: string; phone?: string }
        total?: number
      }
      return parsed
    } catch {
      return null
    }
  }

  const requests = useMemo(() => {
    return requestsData.map((request) => {
      const status =
        request.status === 'approved'
          ? 'Approved'
          : request.status === 'declined'
          ? 'Rejected'
          : 'Pending'
      const declineReason = request.declineReason?.trim() || null
      const noteData = parseNote(request.note)
      const vehicle = (request as { vehicle?: { name: string; image_url?: string; dealer?: { name?: string; contact_phone?: string } } }).vehicle
      const carName = vehicle?.name ?? 'Unknown vehicle'
      const vehicleImage = vehicle?.image_url
      const dealerName = vehicle?.dealer?.name ?? 'Unknown dealer'
      const dealerPhone = vehicle?.dealer?.contact_phone ?? null
      const startDate = noteData?.startDate ?? request.createdAt
      const duration = noteData?.duration ?? null
      const totalAmount = noteData?.total ?? null
      const location = noteData?.delivery?.location ?? null
      const notesDisplay = noteData
        ? `${noteData.duration ?? ''} • Start: ${noteData.startDate ?? ''}${noteData.delivery?.location ? ` • Delivery: ${noteData.delivery.location}` : ''}${noteData.contact ? ` • Contact: ${noteData.contact.firstName} ${noteData.contact.lastName}` : ''}`.trim() || (request.note ?? 'No notes')
        : (request.note ?? 'No notes')
      const displayId = request.id.length > 12 ? `${request.id.slice(0, 8)}...` : request.id
      return {
        id: request.id,
        displayId,
        sourceId: request.id,
        car: carName,
        vehicleImage,
        requestDate: request.createdAt,
        pickupDate: startDate,
        returnDate: noteData?.delivery?.date ?? startDate,
        location: location ?? '—',
        duration: duration ?? '—',
        estimatedAmount: totalAmount ?? null,
        notes: notesDisplay,
        dealer: dealerName,
        phone: dealerPhone,
        responseTime: undefined as string | undefined,
        status,
        rawStatus: request.status,
        priority: undefined as string | undefined,
        declineReason,
        dealerResponse:
          status === 'Approved'
            ? 'Your request has been approved! Payment and pickup steps will follow from the dealer.'
            : status === 'Rejected' && declineReason
              ? declineReason
              : status === 'Rejected'
                ? 'Your request was not approved. If you have questions, contact the dealer.'
                : undefined,
      }
    })
  }, [requestsData])

  const filteredRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const statusNormalized = statusFilter.toLowerCase()
    let list = requests.filter(request => {
      const statusOk = statusNormalized === 'all' || request.status.toLowerCase() === statusNormalized
      const searchOk = !query || [request.id, request.displayId ?? '', request.car, request.dealer].some(value => String(value).toLowerCase().includes(query))
      return statusOk && searchOk
    })

    if (sortBy === 'car') {
      list = [...list].sort((a, b) => a.car.localeCompare(b.car))
    } else {
      list = [...list].sort((a, b) => new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime())
    }
    return list
  }, [requests, searchQuery, statusFilter, sortBy])

  return (
    <div className="my-requests-page">
      <Header />
      
      <div className="requests-container">
        <div className="requests-content">
          <div className="page-header">
            <Link to="/dashboard" className="back-button">
              <ArrowLeft size={14} />
              Back to Dashboard
            </Link>
            <Link to="/browse" className="browse-button">
              <ArrowLeft size={14} />
              Browse Cars
            </Link>
          </div>

          <div className="requests-section">
            <div className="section-header">
              <div>
                <h1 className="page-title">My Requests</h1>
                <p className="page-description">
                {requests.length} total request{requests.length !== 1 ? 's' : ''} • {filteredRequests.length} matching
              </p>
              </div>
              <div className="header-actions">
                <button className="action-button secondary" type="button" onClick={() => refreshRequests()}>
                  <RefreshCw size={14} />
                  Refresh
                </button>
                <Link to="/browse" className="action-button">
                  <Plus size={14} />
                  New Request
                </Link>
              </div>
            </div>

            {/* Search and Filters */}
            <div className="filters-section">
              <div className="search-input-wrapper">
                <Search size={14} className="search-icon" />
                <input
                  type="text"
                  placeholder="Search by car, dealer, or request ID..."
                  className="search-input"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              <div className="filter-controls">
                <label className="filter-button">
                  <select
                    aria-label="Filter by status"
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="Pending">Pending</option>
                    <option value="Approved">Approved</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                  <ChevronDown size={14} />
                </label>
                <label className="filter-button">
                  <select
                    aria-label="Sort requests"
                    value={sortBy}
                    onChange={(event) => setSortBy(event.target.value)}
                  >
                    <option value="date">Request Date</option>
                    <option value="car">Car Name</option>
                  </select>
                  <ChevronDown size={14} />
                </label>
              </div>
            </div>

            {isLoading && (
              <div className="requests-loading">
                <p>Loading requests...</p>
              </div>
            )}

            {queryError && !isLoading && (
              <div className="requests-error">
                <p>Failed to load requests. Please try again later.</p>
              </div>
            )}

            {/* Requests List */}
            <div className="requests-list">
              {filteredRequests.map((request) => (
                <div key={request.id} className="request-card">
                  <div className="request-card-header">
                    <div>
                      <h3 className="request-car-name">{request.car}</h3>
                      <p className="request-id">Request ID: {request.displayId ?? request.id}</p>
                    </div>
                    <div className="request-status-badges">
                      <span className={`status-badge ${request.status.toLowerCase().replace(' ', '-')}`}>
                        {request.status}
                      </span>
                      {request.priority != null && (
                        <span className="priority-badge">
                          {request.priority}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="request-card-body">
                    <div className="request-image">
                      {request.vehicleImage ? (
                        <img src={request.vehicleImage} alt={request.car} className="request-image-img" />
                      ) : (
                        <div className="image-placeholder">{request.car}</div>
                      )}
                    </div>
                    <div className="request-info">
                      <div className="request-details-grid">
                        <div className="detail-item">
                        <Calendar size={18} />
                          <div>
                            <div className="detail-label">Request Date</div>
                            <div className="detail-value">
                              {new Date(request.requestDate).toLocaleDateString('en-US', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                          </div>
                        </div>
                        <div className="detail-item">
                        <Calendar size={18} />
                          <div>
                            <div className="detail-label">Pickup Date</div>
                            <div className="detail-value">
                              {typeof request.pickupDate === 'string' && request.pickupDate.length <= 12
                                ? request.pickupDate
                                : new Date(request.pickupDate).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                            </div>
                          </div>
                        </div>
                        <div className="detail-item">
                        <Calendar size={18} />
                          <div>
                            <div className="detail-label">Return Date</div>
                            <div className="detail-value">
                              {typeof request.returnDate === 'string' && request.returnDate.length <= 12
                                ? request.returnDate
                                : new Date(request.returnDate).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                  })}
                            </div>
                          </div>
                        </div>
                        <div className="detail-item">
                        <MapPin size={18} />
                          <div>
                            <div className="detail-label">Pickup Location</div>
                            <div className="detail-value">{request.location}</div>
                          </div>
                        </div>
                        <div className="detail-item">
                        <Clock size={18} />
                          <div>
                            <div className="detail-label">Duration</div>
                            <div className="detail-value">{request.duration}</div>
                          </div>
                        </div>
                        <div className="detail-item">
                        <DollarSign size={18} />
                          <div>
                            <div className="detail-label">Estimated Amount</div>
                            <div className="detail-value">{request.estimatedAmount != null ? `QAR ${request.estimatedAmount.toLocaleString()}` : '—'}</div>
                          </div>
                        </div>
                      </div>

                      <div className="request-notes">
                        <strong>Notes:</strong> {request.notes}
                      </div>

                      {request.dealerResponse && (
                        <div
                          className={`dealer-response${request.status === 'Rejected' ? ' dealer-response--rejected' : ''}`}
                        >
                          <strong>
                            {request.status === 'Rejected' ? 'Reason from dealer:' : 'Dealer response:'}
                          </strong>{' '}
                          {request.dealerResponse}
                        </div>
                      )}

                      <div className="request-divider"></div>

                      <div className="request-summary">
                        <div className="request-dealer">
                          <div className="dealer-label">Dealer</div>
                          <div className="dealer-name">{request.dealer}</div>
                          {request.phone && <div className="dealer-phone">{request.phone}</div>}
                        </div>
                        {request.responseTime != null && (
                          <div className="response-time">
                            <div className="response-label">Response Time</div>
                            <div className="response-value">{request.responseTime}</div>
                          </div>
                        )}
                      </div>

                      <div className="request-actions">
                        <button
                          className="action-btn"
                          onClick={() =>
                            setInfoModal({
                              title: `Request ${request.id}`,
                              message: `Vehicle: ${request.car}\nStatus: ${request.status}`,
                            })
                          }
                        >
                          View Details
                        </button>
                        {request.phone && (
                          <button
                            className="action-btn"
                            onClick={() => { window.location.href = `tel:${request.phone}` }}
                          >
                            Call Dealer
                          </button>
                        )}
                        <button
                          className="action-btn"
                          onClick={() => window.location.href = `mailto:support@carflow.ai?subject=Request%20${request.id}`}
                        >
                          <MessageCircle size={14} />
                          Message
                        </button>
                        {request.status === 'Pending' && (
                          <button
                            className="action-btn"
                            onClick={() =>
                              setEditModal({
                                sourceId: request.sourceId,
                                requestId: request.id,
                                note: request.notes,
                                status: request.rawStatus,
                              })
                            }
                          >
                            Edit
                          </button>
                        )}
                        <button
                          className="action-btn"
                          onClick={() => {
                            const req = requestsData.find((r) => r.id === request.sourceId)
                            if (req)
                              createBookingRequest({ vehicleId: req.vehicleId, note: req.note ?? `Duplicate of ${request.id}` })
                                .then(() => {
                                  refreshRequests()
                                  toast.success('Request duplicated.')
                                })
                                .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to duplicate'))
                          }}
                        >
                          <Copy size={14} />
                          Duplicate
                        </button>
                        {request.status !== 'Approved' && request.status !== 'Rejected' && (
                          <button
                            className="action-btn danger"
                            type="button"
                            onClick={() => {
                              updateBookingRequestStatus(request.sourceId, 'declined')
                                .then(() => {
                                  refreshRequests()
                                  toast.success('Request cancelled.')
                                })
                                .catch((err) => {
                                  refreshRequests()
                                  toast.error(err instanceof Error ? err.message : 'Failed to cancel')
                                })
                            }}
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Footer />

      <InfoModal
        open={!!infoModal}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onClose={() => setInfoModal(null)}
      />

      {editModal && (
        <div className="request-modal-overlay" onClick={() => setEditModal(null)}>
          <div className="request-modal" onClick={(event) => event.stopPropagation()}>
            <h3>Edit Request {editModal.requestId}</h3>
            <label>
              Status
              <select
                value={editModal.status}
                onChange={(event) =>
                  setEditModal((current) =>
                    current ? { ...current, status: event.target.value as BookingRequest['status'] } : current
                  )
                }
              >
                <option value="pending">Pending</option>
                <option value="declined">Declined</option>
              </select>
            </label>
            <label>
              Notes
              <textarea
                value={editModal.note}
                onChange={(event) =>
                  setEditModal((current) => (current ? { ...current, note: event.target.value } : current))
                }
              />
            </label>
            <div className="request-modal__actions">
              <button type="button" className="action-btn secondary" onClick={() => setEditModal(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="action-btn primary"
                onClick={() => {
                  Promise.all([
                    updateBookingRequestStatus(editModal.sourceId, editModal.status),
                    updateBookingRequestNote(editModal.sourceId, editModal.note),
                  ])
                    .then(() => {
                      queryClient.invalidateQueries({ queryKey: ['bookingRequests'] })
                      toast.success('Request updated.')
                    })
                    .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to update'))
                    .finally(() => setEditModal(null))
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

