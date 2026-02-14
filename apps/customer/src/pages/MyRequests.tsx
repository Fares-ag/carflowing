import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import type { BookingRequest } from '@carflow/shared'
import { createBookingRequest, listBookingRequests, updateBookingRequestStatus } from '../services/customerService'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { InfoModal } from '../components/shared/InfoModal'
import { ArrowLeft, Calendar, ChevronDown, Clock, Copy, DollarSign, MapPin, MessageCircle, Plus, RefreshCw, Search } from 'lucide-react'
import './MyRequests.css'

export function MyRequests() {
  const [requestsData, setRequestsData] = useState<BookingRequest[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('date')
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [editModal, setEditModal] = useState<{ sourceId: string; requestId: string; note: string; status: BookingRequest['status'] } | null>(null)

  const refreshRequests = () => {
    listBookingRequests({ pageSize: 12 }).then((data) => setRequestsData(data.items))
  }

  useEffect(() => {
    refreshRequests()
  }, [])

  const requests = useMemo(() => {
    return requestsData.map((request, index) => {
      const status =
        request.status === 'approved'
          ? 'Approved'
          : request.status === 'declined'
          ? 'Rejected'
          : 'Pending'
      return {
        id: `REQ-2024-${String(index + 1).padStart(3, '0')}`,
        sourceId: request.id,
        car: `Vehicle ${index + 1}`,
        requestDate: request.createdAt,
        pickupDate: request.createdAt,
        returnDate: request.createdAt,
        location: 'Doha',
        duration: '5 days',
        estimatedAmount: 1500 + index * 200,
        notes: request.note ?? 'No notes',
        dealer: `Dealer ${index + 1}`,
        phone: '+974 4455 0000',
        responseTime: '12-24 hours',
        status,
        rawStatus: request.status,
        priority: index % 2 === 0 ? 'High Priority' : 'Normal Priority',
        dealerResponse: status === 'Approved' ? 'Your request has been approved! Please contact us to proceed.' : undefined,
      }
    })
  }, [requestsData])

  const filteredRequests = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    const statusNormalized = statusFilter.toLowerCase()
    let list = requests.filter(request => {
      const statusOk = statusNormalized === 'all' || request.status.toLowerCase() === statusNormalized
      const searchOk = !query || [request.id, request.car, request.dealer].some(value => value.toLowerCase().includes(query))
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
                <p className="page-description">4 total requests • 4 matching</p>
              </div>
              <div className="header-actions">
                <button className="action-button secondary" type="button" onClick={refreshRequests}>
                  <RefreshCw size={14} />
                  Refresh
                </button>
                <button
                  className="action-button"
                  type="button"
                  onClick={() => {
                    createBookingRequest({ vehicleId: 'veh_1', note: 'New request from dashboard' }).then(() => {
                      refreshRequests()
                    })
                  }}
                >
                  <Plus size={14} />
                  New Request
                </button>
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

            {/* Requests List */}
            <div className="requests-list">
              {filteredRequests.map((request) => (
                <div key={request.id} className="request-card">
                  <div className="request-card-header">
                    <div>
                      <h3 className="request-car-name">{request.car}</h3>
                      <p className="request-id">Request ID: {request.id}</p>
                    </div>
                    <div className="request-status-badges">
                      <span className={`status-badge ${request.status.toLowerCase().replace(' ', '-')}`}>
                        {request.status}
                      </span>
                      <span className={`priority-badge ${request.priority.toLowerCase().replace(' ', '-')}`}>
                        {request.priority}
                      </span>
                    </div>
                  </div>

                  <div className="request-card-body">
                    <div className="request-image">
                      <div className="image-placeholder">{request.car}</div>
                    </div>
                    <div className="request-info">
                      <div className="request-details-grid">
                        <div className="detail-item">
                        <Calendar size={18} />
                          <div>
                            <div className="detail-label">Request Date</div>
                            <div className="detail-value">{request.requestDate}</div>
                          </div>
                        </div>
                        <div className="detail-item">
                        <Calendar size={18} />
                          <div>
                            <div className="detail-label">Pickup Date</div>
                            <div className="detail-value">{request.pickupDate}</div>
                          </div>
                        </div>
                        <div className="detail-item">
                        <Calendar size={18} />
                          <div>
                            <div className="detail-label">Return Date</div>
                            <div className="detail-value">{request.returnDate}</div>
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
                            <div className="detail-value">QAR {request.estimatedAmount.toLocaleString()}</div>
                          </div>
                        </div>
                      </div>

                      <div className="request-notes">
                        <strong>Notes:</strong> {request.notes}
                      </div>

                      {request.dealerResponse && (
                        <div className="dealer-response">
                          <strong>Dealer Response:</strong> {request.dealerResponse}
                        </div>
                      )}

                      <div className="request-divider"></div>

                      <div className="request-summary">
                        <div className="request-dealer">
                          <div className="dealer-label">Dealer</div>
                          <div className="dealer-name">{request.dealer}</div>
                          <div className="dealer-phone">{request.phone}</div>
                        </div>
                        <div className="response-time">
                          <div className="response-label">Response Time</div>
                          <div className="response-value">{request.responseTime}</div>
                        </div>
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
                        <button
                          className="action-btn"
                          onClick={() => window.location.href = `tel:${request.phone}`}
                        >
                          Call Dealer
                        </button>
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
                          onClick={() =>
                            createBookingRequest({ vehicleId: request.sourceId, note: `Duplicate of ${request.id}` })
                              .then(() => refreshRequests())
                          }
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
                                .then(() => refreshRequests())
                                .catch(() => refreshRequests())
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
                <option value="approved">Approved</option>
                <option value="declined">Rejected</option>
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
                  updateBookingRequestStatus(editModal.sourceId, editModal.status)
                    .catch(() => null)
                    .finally(() => {
                      setRequestsData((prev) =>
                        prev.map((item) =>
                          item.id === editModal.sourceId ? { ...item, note: editModal.note, status: editModal.status } : item
                        )
                      )
                      setEditModal(null)
                    })
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

