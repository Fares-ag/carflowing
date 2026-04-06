import { Link, useNavigate } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listRentalsWithDetails } from '../services/customerService'
import { Header } from '../components/shared/Header'
import { Footer } from '../components/shared/Footer'
import { InfoModal } from '../components/shared/InfoModal'
import { ArrowLeft, Building2, Calendar, CreditCard, Download } from 'lucide-react'
import './MyRentals.css'

export function MyRentals() {
  const navigate = useNavigate()
  const [infoModal, setInfoModal] = useState<{ title: string; message: string } | null>(null)
  const [extendModal, setExtendModal] = useState<{ phone: string | null } | null>(null)

  const { data: rentalsData, isLoading, isError } = useQuery({
    queryKey: ['rentals', 'details', 12],
    queryFn: () => listRentalsWithDetails({ pageSize: 12 }),
  })
  const rentals = rentalsData?.items ?? []

  const activeRentals = useMemo(() => {
    return rentals
      .filter(rental => rental.status === 'active' || rental.status === 'reserved')
      .map((rental) => {
        const start = new Date(rental.startDate)
        const end = new Date(rental.endDate)
        const now = new Date()
        const daysRemaining = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
        const totalDays = Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)))
        return {
          id: rental.id.slice(0, 8),
          sourceId: rental.id,
          car: rental.vehicle?.name ?? 'Unknown vehicle',
          vehicleImage: rental.vehicle?.image_url,
          pickupDate: rental.startDate,
          returnDate: rental.endDate,
          dealerName: rental.dealer?.name ?? 'Unknown dealer',
          remaining: `${daysRemaining} days`,
          totalAmount: rental.totalAmount,
          dailyRate: Math.round(rental.totalAmount / totalDays),
          dealer: rental.dealer?.name ?? 'Unknown dealer',
          phone: rental.dealer?.contact_phone ?? null,
          status: rental.status === 'active' ? 'Active' : 'Pending Payment',
          balance: rental.status === 'reserved' ? rental.totalAmount * 0.25 : undefined,
        }
      })
  }, [rentals])

  const pastRentals = useMemo(() => {
    return rentals
      .filter(rental => rental.status === 'completed' || rental.status === 'cancelled')
      .map((rental) => ({
        id: rental.id.slice(0, 8),
        sourceId: rental.id,
        car: rental.vehicle?.name ?? 'Unknown vehicle',
        vehicleImage: rental.vehicle?.image_url,
        duration: `${rental.startDate} - ${rental.endDate}`,
        dealerName: rental.dealer?.name ?? 'Unknown dealer',
        total: rental.totalAmount,
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
      ...rows.map(row => headers.map(header => `"${(row as Record<string, string>)[header] ?? ''}"`).join(',')),
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
              <button
                className="download-button"
                type="button"
                onClick={handleDownloadAll}
                disabled={isLoading || isError}
              >
                <Download size={14} />
                Download All
              </button>
            </div>

            {isLoading ? (
              <p className="page-description" role="status">
                Loading your rentals…
              </p>
            ) : isError ? (
              <p className="page-description" role="alert">
                We could not load your rentals. Please refresh the page or try again later.
              </p>
            ) : (
              <>
            {/* Active Rentals */}
            <div className="rentals-subsection">
              <div className="subsection-header">
                <h2 className="subsection-title">Active Rentals</h2>
                <span className="badge-count">{activeRentals.length}</span>
              </div>

              <div className="rentals-list">
                {activeRentals.map((rental) => (
                  <div key={rental.sourceId} className="rental-card">
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
                        {rental.vehicleImage ? (
                          <img src={rental.vehicleImage} alt={rental.car} className="rental-image-img" />
                        ) : (
                          <div className="image-placeholder">{rental.car}</div>
                        )}
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
                          <Building2 size={14} />
                            <div>
                              <div className="detail-label">Dealer</div>
                              <div className="detail-value">{rental.dealerName}</div>
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
                            {rental.phone && <div className="dealer-phone">{rental.phone}</div>}
                          </div>
                        </div>

                        {rental.balance != null && (
                          <div className="payment-due-notice">
                            Payment due at pickup
                          </div>
                        )}

                        <div className="rental-actions">
                          {rental.phone && (
                            <button className="action-btn" onClick={() => { window.location.href = `tel:${rental.phone}` }}>
                              Call
                            </button>
                          )}
                          <button
                            className="action-btn"
                            onClick={() => window.location.href = `mailto:support@carflow.ai?subject=Rental%20${rental.id}`}
                          >
                            Message
                          </button>
                          {!rental.balance && (
                            <button
                              className="action-btn"
                              type="button"
                              onClick={() => setExtendModal({ phone: rental.phone })}
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
                  <div key={rental.sourceId} className="rental-card history">
                    <div className="rental-card-body">
                      <div className="rental-image small">
                        {rental.vehicleImage ? (
                          <img src={rental.vehicleImage} alt={rental.car} className="rental-image-img" />
                        ) : (
                          <div className="image-placeholder">{rental.car}</div>
                        )}
                      </div>
                      <div className="rental-info">
                        <div className="rental-header-compact">
                          <div>
                            <h3 className="rental-car-name">{rental.car}</h3>
                            <p className="rental-id">{rental.id}</p>
                          </div>
                          <span
                            className={`status-badge ${rental.status === 'Completed' ? 'completed' : 'cancelled'}`}
                          >
                            {rental.status}
                          </span>
                        </div>

                        <div className="rental-details-compact">
                          <div>
                            <div className="detail-label">Duration</div>
                            <div className="detail-value">{rental.duration}</div>
                          </div>
                          <div>
                            <div className="detail-label">Dealer</div>
                            <div className="detail-value">{rental.dealerName}</div>
                          </div>
                          <div>
                            <div className="detail-label">Total</div>
                            <div className="detail-value">QAR {rental.total.toLocaleString()}</div>
                          </div>
                        </div>

                        <div className="rental-actions">
                          <button
                            className="action-btn"
                            onClick={() =>
                              downloadText(
                                `receipt-${rental.id}.txt`,
                                `Receipt for ${rental.car}\nTotal: QAR ${rental.total.toLocaleString()}\nDealer: ${rental.dealerName}`
                              )
                            }
                          >
                            Receipt
                          </button>
                          <button className="action-btn" onClick={() => navigate('/browse')}>
                            Rent Again
                          </button>
                          <a
                            className="action-btn"
                            href={`mailto:support@carflow.ai?subject=${encodeURIComponent(`Feedback for Rental ${rental.sourceId}`)}`}
                          >
                            Leave Feedback
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
              </>
            )}
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

      <InfoModal
        open={extendModal !== null}
        title="Extend your rental"
        message="To extend your rental, please contact the dealer directly."
        onClose={() => setExtendModal(null)}
      >
        {extendModal?.phone ? (
          <p className="customerInfoModalMessage">
            <a href={`tel:${extendModal.phone.replace(/\s/g, '')}`}>{extendModal.phone}</a>
          </p>
        ) : (
          <p className="customerInfoModalMessage">No phone number is on file for this dealer.</p>
        )}
      </InfoModal>
    </div>
  )
}

