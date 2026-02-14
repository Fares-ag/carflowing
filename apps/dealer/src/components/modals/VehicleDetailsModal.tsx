import { memo, useEffect, useState } from 'react'
import { Copy, Download } from 'lucide-react'
import { Modal } from './Modal'
import './VehicleDetailsModal.css'

export type VehicleDetailsTab = 'specifications' | 'maintenance' | 'analytics'

export interface VehicleDetailsVehicle {
  id: string
  name: string
  year: number
  category: string
  status: 'Available' | 'Rented' | 'Maintenance'
  dailyRateQar: number
  rating: number
  totalBookings: number
  totalRevenueQar: number
  licensePlate: string
}

export interface VehicleDetailsModalProps {
  isOpen: boolean
  vehicle: VehicleDetailsVehicle
  initialTab?: VehicleDetailsTab
  onClose: () => void
  onEditVehicle?: () => void
}

export const VehicleDetailsModal = memo(function VehicleDetailsModal({
  isOpen,
  vehicle,
  initialTab = 'specifications',
  onClose,
  onEditVehicle,
}: VehicleDetailsModalProps) {
  const [tab, setTab] = useState<VehicleDetailsTab>(initialTab)

  // Reset to initial tab whenever a new vehicle is shown
  useEffect(() => {
    setTab(initialTab)
  }, [vehicle.id, vehicle.name, initialTab])

  const statusClass =
    vehicle.status === 'Available'
      ? 'vfd-badge--available'
      : vehicle.status === 'Rented'
        ? 'vfd-badge--rented'
        : 'vfd-badge--maintenance'

  if (!isOpen) return null

  return (
    <Modal title={vehicle.name} size="md" onClose={onClose}>
      <div className="vfd">
        <div className="vfdHeader">
          <div className="vfdHeaderLeft">
            <div className="vfdTitle">{vehicle.name}</div>
            <div className="vfdSubtitle">Complete vehicle details and performance metrics</div>
          </div>
          <button className="vfdHeaderIconBtn" type="button" aria-label="Quick action">
            ✎
          </button>
        </div>

        <div className="vfdBody">
          <div className="vfdTopGrid">
            <div className="vfdImageCard">
              <div className={`vfdImage vfdImage--${vehicle.id}`} />
              <div className={`vfdBadge ${statusClass}`}>{vehicle.status}</div>
            </div>

            <div className="vfdRight">
              <section className="vfdSection">
                <div className="vfdSectionTitle">Vehicle Information</div>
                <div className="vfdDivider" />
                <div className="vfdInfoGrid">
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">Category</div>
                    <div className="vfdInfoValue">{vehicle.category}</div>
                  </div>
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">Year</div>
                    <div className="vfdInfoValue">{vehicle.year}</div>
                  </div>
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">Fuel Type</div>
                    <div className="vfdInfoValue">Petrol</div>
                  </div>
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">Transmission</div>
                    <div className="vfdInfoValue">Automatic</div>
                  </div>
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">Seating</div>
                    <div className="vfdInfoValue">5 seats</div>
                  </div>
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">Color</div>
                    <div className="vfdInfoValue">Midnight Black</div>
                  </div>
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">License Plate</div>
                    <div className="vfdInfoValue">{vehicle.licensePlate}</div>
                  </div>
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">Daily Rate</div>
                    <div className="vfdInfoValue vfdInfoValue--accent">QAR {vehicle.dailyRateQar}</div>
                  </div>
                </div>
              </section>

              <section className="vfdSection">
                <div className="vfdSectionTitle">Performance Metrics</div>
                <div className="vfdDivider" />
                <div className="vfdMetricGrid">
                  <div className="vfdMetricCard vfdMetricCard--blue">
                    <div className="vfdMetricLabel">Total Bookings</div>
                    <div className="vfdMetricValue">{vehicle.totalBookings}</div>
                  </div>
                  <div className="vfdMetricCard vfdMetricCard--green">
                    <div className="vfdMetricLabel">Total Revenue</div>
                    <div className="vfdMetricValue">QAR {vehicle.totalRevenueQar.toLocaleString()}</div>
                  </div>
                  <div className="vfdMetricCard vfdMetricCard--yellow">
                    <div className="vfdMetricLabel">Customer Rating</div>
                    <div className="vfdMetricValue">
                      <span className="vfdStar" aria-hidden="true">
                        ★
                      </span>{' '}
                      {vehicle.rating.toFixed(1)}
                    </div>
                  </div>
                  <div className="vfdMetricCard vfdMetricCard--purple">
                    <div className="vfdMetricLabel">Status</div>
                    <div className="vfdMetricValue vfdMetricValue--small">{vehicle.status}</div>
                  </div>
                </div>
              </section>

              <section className="vfdSection">
                <div className="vfdSectionTitle">Features</div>
                <div className="vfdDivider" />
                <div className="vfdFeatureList">
                  {['Leather Seats', 'Sunroof', 'Navigation', 'Bluetooth', 'Backup Camera'].map((f) => (
                    <div key={f} className="vfdFeatureItem">
                      <span className="vfdDot" aria-hidden="true" />
                      {f}
                    </div>
                  ))}
                </div>
              </section>

              <section className="vfdSection">
                <div className="vfdSectionTitle">Description</div>
                <div className="vfdDivider" />
                <div className="vfdDescriptionCard">Luxury SUV with premium features and excellent performance.</div>
              </section>
            </div>
          </div>

          <div className="vfdTabsBlock">
            <div className="vfdTabs">
              <button
                className={`vfdTab ${tab === 'specifications' ? 'active' : ''}`}
                type="button"
                onClick={() => setTab('specifications')}
              >
                Specifications
              </button>
              <button
                className={`vfdTab ${tab === 'maintenance' ? 'active' : ''}`}
                type="button"
                onClick={() => setTab('maintenance')}
              >
                Maintenance
              </button>
              <button
                className={`vfdTab ${tab === 'analytics' ? 'active' : ''}`}
                type="button"
                onClick={() => setTab('analytics')}
              >
                Analytics
              </button>
            </div>

            {tab === 'specifications' && (
              <div className="vfdTabCard">
                <div className="vfdTabCardTitle">Technical Specifications</div>
                <div className="vfdSpecGrid">
                  {[
                    ['Engine', '2.0L Turbo'],
                    ['Mileage', '25,000 km'],
                    ['Top Speed', '220 km/h'],
                    ['Acceleration', '6.5s (0-100 km/h)'],
                    ['Fuel Economy', '8.5L/100km'],
                    ['Weight', '1,650 kg'],
                  ].map(([k, v]) => (
                    <div key={k} className="vfdSpecItem">
                      <div className="vfdSpecLabel">{k}</div>
                      <div className="vfdSpecValue">{v}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'maintenance' && (
              <div className="vfdTabCard">
                <div className="vfdTabCardTitle">Maintenance History</div>
                <div className="vfdMaintList">
                  {[
                    { title: 'Oil Change', date: '2025-01-15', cost: 180 },
                    { title: 'Tire Rotation', date: '2024-12-20', cost: 120 },
                    { title: 'Brake Inspection', date: '2024-11-30', cost: 250 },
                  ].map((m) => (
                    <div key={m.title} className="vfdMaintRow">
                      <div>
                        <div className="vfdMaintTitle">{m.title}</div>
                        <div className="vfdMaintDate">{m.date}</div>
                      </div>
                      <div className="vfdMaintRight">
                        <div className="vfdMaintBadge">Completed</div>
                        <div className="vfdMaintCost">QAR {m.cost}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === 'analytics' && (
              <div className="vfdAnalyticsGrid">
                <div className="vfdTabCard">
                  <div className="vfdTabCardTitle">Utilization Rate</div>
                  <div className="vfdUtilRow">
                    <div className="vfdUtilLabel">This Month</div>
                    <div className="vfdUtilValue">85%</div>
                  </div>
                  <div className="vfdBar">
                    <div className="vfdBarFill" style={{ width: '100%' }} />
                  </div>
                  <div className="vfdUtilRow">
                    <div className="vfdUtilLabel">Last Month</div>
                    <div className="vfdUtilValue">78%</div>
                  </div>
                  <div className="vfdBar">
                    <div className="vfdBarFill" style={{ width: '90%' }} />
                  </div>
                </div>

                <div className="vfdTabCard">
                  <div className="vfdTabCardTitle">Booking Trends</div>
                  <div className="vfdKv">
                    <div className="vfdKvLabel">Average Booking Duration</div>
                    <div className="vfdKvValue">4.2 days</div>
                  </div>
                  <div className="vfdKv">
                    <div className="vfdKvLabel">Repeat Customers</div>
                    <div className="vfdKvValue">65%</div>
                  </div>
                  <div className="vfdKv">
                    <div className="vfdKvLabel">Peak Season</div>
                    <div className="vfdKvValue">Summer</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="vfdFooter">
          <div className="vfdFooterLeft">
            <button className="vfdFooterBtn" type="button">
              <Download size={14} />
              Export Details
            </button>
            <button className="vfdFooterBtn" type="button">
              <Copy size={14} />
              Duplicate Vehicle
            </button>
          </div>
          <div className="vfdFooterRight">
            <button className="vfdFooterBtn" type="button" onClick={onClose}>
              Close
            </button>
            <button
              className="vfdFooterBtn vfdFooterBtn--primary"
              type="button"
              onClick={() => {
                onEditVehicle?.()
              }}
            >
              ✏️ Edit Vehicle
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
})

