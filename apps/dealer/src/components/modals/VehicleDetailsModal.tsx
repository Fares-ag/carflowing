import { memo, useEffect, useMemo, useState } from 'react'
import { Copy, Download } from 'lucide-react'
import type { VehicleCategory } from '@carflow/shared'
import { Modal } from './Modal'
import './VehicleDetailsModal.css'

export type VehicleDetailsTab = 'specifications' | 'maintenance' | 'analytics'

export type VehicleDetailsVehicle = {
  id: string
  name: string
  make: string
  model: string
  year: number
  category: VehicleCategory
  status: 'Available' | 'Rented' | 'Maintenance'
  dailyRateQar: number
  mileage: number
  fuelType: 'gas' | 'diesel' | 'electric' | 'hybrid'
  transmission: 'automatic' | 'manual'
  seats: number
  rating: number
  totalBookings: number
  totalRevenueQar: number
  imageUrl?: string
}

function formatCategory(category: VehicleCategory): string {
  if (category === 'suv') return 'SUV'
  if (category === 'ev') return 'EV'
  return category.charAt(0).toUpperCase() + category.slice(1)
}

function fuelTypeLabel(fuelType: VehicleDetailsVehicle['fuelType']): string {
  switch (fuelType) {
    case 'gas':
      return 'Petrol'
    case 'diesel':
      return 'Diesel'
    case 'electric':
      return 'Electric'
    case 'hybrid':
      return 'Hybrid'
    default:
      return fuelType
  }
}

export interface VehicleDetailsModalProps {
  isOpen: boolean
  vehicle: VehicleDetailsVehicle
  initialTab?: VehicleDetailsTab
  onClose: () => void
  onEditVehicle?: () => void
  onDuplicateVehicle?: (vehicle: VehicleDetailsVehicle) => void
}

export const VehicleDetailsModal = memo(function VehicleDetailsModal({
  isOpen,
  vehicle,
  initialTab = 'specifications',
  onClose,
  onEditVehicle,
  onDuplicateVehicle,
}: VehicleDetailsModalProps) {
  const [tab, setTab] = useState<VehicleDetailsTab>(initialTab)

  useEffect(() => {
    setTab(initialTab)
  }, [vehicle.id, vehicle.name, initialTab])

  const exportPayload = useMemo(
    () => ({
      id: vehicle.id,
      name: vehicle.name,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      category: vehicle.category,
      status: vehicle.status,
      dailyRateQar: vehicle.dailyRateQar,
      mileage: vehicle.mileage,
      fuelType: vehicle.fuelType,
      transmission: vehicle.transmission,
      seats: vehicle.seats,
      imageUrl: vehicle.imageUrl,
    }),
    [vehicle]
  )

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `vehicle-${vehicle.id.slice(0, 8)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(link.href)
  }

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
          <button
            className="vfdHeaderIconBtn"
            type="button"
            aria-label="Edit vehicle"
            onClick={() => onEditVehicle?.()}
          >
            ✎
          </button>
        </div>

        <div className="vfdBody">
          <div className="vfdTopGrid">
            <div className="vfdImageCard">
              {vehicle.imageUrl ? (
                <img src={vehicle.imageUrl} alt="" className="vfdImage vfdImage--photo" />
              ) : (
                <div className={`vfdImage vfdImage--${vehicle.id}`} />
              )}
              <div className={`vfdBadge ${statusClass}`}>{vehicle.status}</div>
            </div>

            <div className="vfdRight">
              <section className="vfdSection">
                <div className="vfdSectionTitle">Vehicle Information</div>
                <div className="vfdDivider" />
                <div className="vfdInfoGrid">
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">Make / Model</div>
                    <div className="vfdInfoValue">
                      {vehicle.make} {vehicle.model}
                    </div>
                  </div>
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">Category</div>
                    <div className="vfdInfoValue">{formatCategory(vehicle.category)}</div>
                  </div>
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">Year</div>
                    <div className="vfdInfoValue">{vehicle.year}</div>
                  </div>
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">Fuel Type</div>
                    <div className="vfdInfoValue">{fuelTypeLabel(vehicle.fuelType)}</div>
                  </div>
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">Transmission</div>
                    <div className="vfdInfoValue">
                      {vehicle.transmission === 'automatic' ? 'Automatic' : 'Manual'}
                    </div>
                  </div>
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">Seating</div>
                    <div className="vfdInfoValue">{vehicle.seats} seats</div>
                  </div>
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">Mileage</div>
                    <div className="vfdInfoValue">{vehicle.mileage.toLocaleString()} km</div>
                  </div>
                  <div className="vfdInfoItem">
                    <div className="vfdInfoLabel">Daily Rate</div>
                    <div className="vfdInfoValue vfdInfoValue--accent">
                      QAR {vehicle.dailyRateQar.toLocaleString()}
                    </div>
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
                  {(
                    [
                      ['Year', String(vehicle.year)],
                      ['Category', formatCategory(vehicle.category)],
                      ['Fuel type', fuelTypeLabel(vehicle.fuelType)],
                      ['Transmission', vehicle.transmission === 'automatic' ? 'Automatic' : 'Manual'],
                      ['Seats', `${vehicle.seats}`],
                      ['Mileage', `${vehicle.mileage.toLocaleString()} km`],
                      ['Price per day', `QAR ${vehicle.dailyRateQar.toLocaleString()}`],
                    ] as const
                  ).map(([k, v]) => (
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
                <p className="vfdPlaceholderMsg">No maintenance records yet.</p>
              </div>
            )}

            {tab === 'analytics' && (
              <div className="vfdTabCard">
                <div className="vfdTabCardTitle">Analytics</div>
                <p className="vfdPlaceholderMsg">No analytics data yet.</p>
              </div>
            )}
          </div>
        </div>

        <div className="vfdFooter">
          <div className="vfdFooterLeft">
            <button className="vfdFooterBtn" type="button" onClick={handleExport}>
              <Download size={14} />
              Export Details
            </button>
            <button
              className="vfdFooterBtn"
              type="button"
              onClick={() => onDuplicateVehicle?.(vehicle)}
            >
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
