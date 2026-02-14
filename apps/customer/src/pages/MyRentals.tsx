import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import type { Rental } from '@carflow/shared'
import { listRentals, updateRentalStatus } from '../services/customerService'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { InfoModal } from '../components/shared/InfoModal'
import { ArrowLeft, Calendar, CreditCard, Download, MapPin, Star } from 'lucide-react'
import './MyRentals.css'

export function MyRentals() {
  const navigate = useNavigate()
  const [rentals, setRentals] = useState<Rental[]>([])
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)

  const refreshRentals = () => {
    listRentals({ pageSize: 12 }).then((data) => setRentals(data.items))
  }

  useEffect(() => {
    refreshRentals()
  }, [])

  const activeRentals = useMemo(() => {
    return rentals
      .filter(rental => rental.status === 'active' || rental.status === 'reserved')
      .map((rental, index) => ({
        id: `RNT-2024-${String(index + 1).padStart(3, '0')}`,
        sourceId: rental.id,
        car: `Vehicle ${index + 1}`,
        pickupDate: rental.startDate,
        returnDate: rental.endDate,
        location: 'Doha',
        remaining: `${index + 2} days`,
        totalAmount: rental.totalAmount,
        dailyRate: Math.round(rental.totalAmount / (index + 2)),
        dealer: `Dealer ${index + 1}`,
        phone: '+974 4455 0000',
        status: rental.status === 'active' ? 'Active' : 'Pending Payment',
        balance: rental.status === 'reserved' ? rental.totalAmount * 0.25 : undefined,
      }))
  }, [rentals])

  const pastRentals = useMemo(() => {
    return rentals
      .filter(rental => rental.status === 'completed' || rental.status === 'cancelled')
      .map((rental, index) => ({
        id: `RNT-2024-${String(index + 10).padStart(3, '0')}`,
        sourceId: rental.id,
        car: `Vehicle ${index + 3}`,
        duration: `${rental.startDate} - ${rental.endDate}`,
        location: 'Doha',
        total: rental.totalAmount,
        rating: 4,
        status: rental.status === 'completed' ? 'Completed' : 'Cancelled',
      }))
  }, [rentals])

  const handleDownloadAll = () => {
    const rows = [
      ...activeRentals.map(rental => ({
        id: rental.id,
        status: rental.status,
        car: rental.car,
        pickup: rental.pickupDate,
        return: rental.returnDate,
        total: `QAR ${rental.totalAmount.toLocaleString()}`,
      })),
      ...pastRentals.map(rental => ({
        id: rental.id,
        status: rental.status,
        car: rental.car,
        pickup: rental.duration.split(' - ')[0] ?? '',
        return: rental.duration.split(' - ')[1] ?? '',
        total: `QAR ${rental.total.toLocaleString()}`,
      })),
    ]
    const headers = Object.keys(rows[0] ?? {})
    const csv = [
      headers.join(','),
      ...rows.map(row => headers.map(header => `"${row[header] ?? ''}"`).join(',')),
    ].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', 'my-rentals.csv')
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  const downloadText = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.setAttribute('download', filename)
    document.body.appendChild(link)
    link.click()
    link.remove()
  }

  return (
    <div className="my-rentals-page">
      <Header />
      
      <div className="rentals-container">
        <div className="rentals-content">
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

          <div className="rentals-section">
            <div className="section-header">
              <div>
                <h1 className="page-title">My Rentals</h1>
                <p className="page-description">Manage your current and past car rentals</p>
              </div>
              <button className="download-button" type="button" onClick={handleDownloadAll}>
                <Download size={14} />
                Download All
              </button>
            </div>

            {/* Active Rentals */}
            <div className="rentals-subsection">
              <div className="subsection-header">
                <h2 className="subsection-title">Active Rentals</h2>
                <span className="badge-count">{activeRentals.length}</span>
              </div>

              <div className="rentals-list">
                {activeRentals.map((rental) => (
                  <div key={rental.id} className="rental-card">
                    <div className="rental-card-header">
                      <div>
                        <h3 className="rental-car-name">{rental.car}</h3>
                        <p className="rental-id">ID: {rental.id}</p>
                      </div>
                      <div className="rental-status-badges">
                        <span className={`status-badge ${rental.status.toLowerCase().replace(' ', '-')}`}>
                          {rental.status}
                        </span>
                        {rental.balance && (
                          <span className="balance-badge">QAR {rental.balance}</span>
                        )}
                      </div>
                    </div>

                    <div className="rental-card-body">
                      <div className="rental-image">
                        <div className="image-placeholder">{rental.car}</div>
                      </div>
                      <div className="rental-info">
                        <div className="rental-details-grid">
                          <div className="detail-item">
                          <Calendar size={14} />
                            <div>
                              <div className="detail-label">Pickup</div>
                              <div className="detail-value">{rental.pickupDate}</div>
                            </div>
                          </div>
                          <div className="detail-item">
                          <Calendar size={14} />
                            <div>
                              <div className="detail-label">Return</div>
                              <div className="detail-value">{rental.returnDate}</div>
                            </div>
                          </div>
                          <div className="detail-item">
                          <MapPin size={14} />
                            <div>
                              <div className="detail-label">Location</div>
                              <div className="detail-value">{rental.location}</div>
                            </div>
                          </div>
                          <div className="detail-item">
                          <CreditCard size={14} />
                            <div>
                              <div className="detail-label">Remaining</div>
                              <div className="detail-value">{rental.remaining}</div>
                            </div>
                          </div>
                        </div>

                        <div className="rental-divider"></div>

                        <div className="rental-summary">
                          <div className="rental-pricing">
                            <div className="pricing-label">Total Amount</div>
                            <div className="pricing-amount">QAR {rental.totalAmount.toLocaleString()}</div>
                            <div className="pricing-rate">QAR {rental.dailyRate}/day</div>
                          </div>
                          <div className="rental-dealer">
                            <div className="dealer-label">Dealer</div>
                            <div className="dealer-name">{rental.dealer}</div>
                            <div className="dealer-phone">{rental.phone}</div>
                          </div>
                        </div>

                        <div className="rental-actions">
                          <button className="action-btn" onClick={() => window.location.href = `tel:${rental.phone}`}>
                            Call
                          </button>
                          <button
                            className="action-btn"
                            onClick={() => window.location.href = `mailto:support@carflow.ai?subject=Rental%20${rental.id}`}
                          >
                            Message
                          </button>
                          {rental.balance ? (
                            <button
                              className="action-btn primary"
                              type="button"
                              onClick={() => {
                              updateRentalStatus(rental.sourceId, 'active').then(() => refreshRentals())
                              }}
                            >
                              Pay Balance
                            </button>
                          ) : (
                            <button
                              className="action-btn"
                              type="button"
                              onClick={() =>
                                setInfoModal({
                                  title: 'Extension Request',
                                  message: `Extension request sent for ${rental.id}.`,
                                })
                              }
                            >
                              Extend
                            </button>
                          )}
                          <button
                            className="action-btn"
                            onClick={() =>
                              downloadText(
                                `contract-${rental.id}.txt`,
                                `Contract for ${rental.car}\nRental ID: ${rental.id}\nDates: ${rental.pickupDate} - ${rental.returnDate}`
                              )
                            }
                          >
                            Contract
                          </button>
                          <button
                            className="action-btn"
                            onClick={() =>
                              setInfoModal({
                                title: `Rental ${rental.id}`,
                                message: `Vehicle: ${rental.car}\nStatus: ${rental.status}`,
                              })
                            }
                          >
                            Details
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rental History */}
            <div className="rentals-subsection">
              <div className="subsection-header">
                <h2 className="subsection-title">Rental History</h2>
                <span className="badge-count">{pastRentals.length}</span>
              </div>

              <div className="rentals-list">
                {pastRentals.map((rental) => (
                  <div key={rental.id} className="rental-card history">
                    <div className="rental-card-body">
                      <div className="rental-image small">
                        <div className="image-placeholder">{rental.car}</div>
                      </div>
                      <div className="rental-info">
                        <div className="rental-header-compact">
                          <div>
                            <h3 className="rental-car-name">{rental.car}</h3>
                            <p className="rental-id">{rental.id}</p>
                          </div>
                          <span className="status-badge completed">Completed</span>
                        </div>

                        <div className="rental-details-compact">
                          <div>
                            <div className="detail-label">Duration</div>
                            <div className="detail-value">{rental.duration}</div>
                          </div>
                          <div>
                            <div className="detail-label">Location</div>
                            <div className="detail-value">{rental.location}</div>
                          </div>
                          <div>
                            <div className="detail-label">Total</div>
                            <div className="detail-value">QAR {rental.total.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="detail-label">Rating</div>
                            <div className="rating-value">
                          {rental.rating} <Star size={12} />
                            </div>
                          </div>
                        </div>

                        <div className="rental-actions">
                          <button
                            className="action-btn"
                            onClick={() =>
                              downloadText(
                                `receipt-${rental.id}.txt`,
                                `Receipt for ${rental.car}\nTotal: QAR ${rental.total.toLocaleString()}\nLocation: ${rental.location}`
                              )
                            }
                          >
                            Receipt
                          </button>
                          <button className="action-btn" onClick={() => navigate('/browse')}>
                            Rent Again
                          </button>
                          {rental.rating < 5 && (
                            <button
                              className="action-btn"
                              onClick={() =>
                                setInfoModal({
                                  title: 'Rating Submitted',
                                  message: `Thanks for rating ${rental.car}!`,
                                })
                              }
                            >
                              Rate
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
      </div>

      <Footer />

      <InfoModal
        open={!!infoModal}
        title={infoModal?.title ?? ''}
        message={infoModal?.message ?? ''}
        onClose={() => setInfoModal(null)}
      />
    </div>
  )
}

